package fr.inria.corese.benchmark;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.inria.corese.benchmark.driver.DriverFactory;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.harness.BenchmarkHarness;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.report.BenchmarkReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Entry point for the benchmark harness.
 * Supports running multiple engines sequentially in isolated child JVM processes
 * to prevent JIT and GC cross-contamination.
 */
public class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);
    private static final long CHILD_TIMEOUT_MINUTES = 30;

    private record BenchmarkOptions(
        String datasetDir,
        String outputFile,
        List<String> engines,
        String datasetName,
        String queriesFile,
        boolean inference,
        boolean quick,
        int queryTimeoutSecs,
        boolean isolateProcess
    ) {}

    private Main() {}

    /**
     * Parses command-line arguments, runs the load and (optionally) query benchmarks
     * for each specified engine, then writes the combined report.
     *
     * <p>Arguments:
     * <ol>
     *   <li>{@code datasetDir}   — directory containing RDF files (.nt, .nq, .ttl, .trig)</li>
     *   <li>{@code outputFile}   — path for the generated JSON report</li>
     *   <li>{@code engines}      — comma-separated engine names (e.g. {@code corese.4.6.5,jena.6.2.0})</li>
     *   <li>{@code datasetName}  — (optional) logical dataset label; defaults to {@code "dataset"}</li>
     *   <li>{@code queriesFile}  — (optional) path to a file with one SPARQL query per line</li>
     *   <li>{@code --inference}  — (optional flag) enables RDFS inference for Corese drivers</li>
     *   <li>{@code --quick}      — (optional flag) quick mode (1 repetition)</li>
     *   <li>{@code --no-isolate} — (optional flag) disable subprocess JVM isolation</li>
     * </ol>
     *
     * @param args command-line arguments as described above
     */
    public static void main(String[] args) {
        if (args.length < 3) {
            log.error("Usage: benchmark <datasetDir> <outputFile> <engine1,engine2,...> [datasetName] [queriesFile]");
            System.exit(1);
        }

        BenchmarkOptions opts = parseOptions(args);
        List<String> queries = loadQueries(opts.queriesFile());

        List<FileResult> allFileResults = new ArrayList<>();
        List<QueryResult> allQueryResults = new ArrayList<>();

        boolean shouldIsolate = opts.isolateProcess() && opts.engines().size() > 1;
        for (String engineName : opts.engines()) {
            String cleanName = engineName.trim();
            if (shouldIsolate) {
                runChild(cleanName, opts, allFileResults, allQueryResults);
            } else {
                runEngine(cleanName, opts, queries, allFileResults, allQueryResults);
            }
        }

        crossValidateQueries(allQueryResults);

        try {
            BenchmarkReport.write(allFileResults, allQueryResults, queries, opts.outputFile());
        } catch (Exception e) {
            log.error("Failed to write report: {}", e.getMessage(), e);
            System.exit(1);
        }
    }

    private static void crossValidateQueries(List<QueryResult> queryResults) {
        if (queryResults == null || queryResults.isEmpty()) {
            return;
        }
        java.util.Map<String, List<QueryResult>> grouped = new java.util.HashMap<>();
        for (QueryResult qr : queryResults) {
            String key = qr.dataset() + "::" + qr.queryId();
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(qr);
        }

        for (int i = 0; i < queryResults.size(); i++) {
            QueryResult qr = queryResults.get(i);
            if (!"PASS".equals(qr.status()) || qr.resultHash().isEmpty()) {
                continue;
            }
            List<QueryResult> peers = grouped.get(qr.dataset() + "::" + qr.queryId());
            if (hasPeerMismatch(qr, peers)) {
                log.warn("Cross-engine mismatch detected for query {} on dataset {}: engine {} produced hash {} (rows: {})",
                    qr.queryId(), qr.dataset(), qr.engine(), qr.resultHash().substring(0, Math.min(8, qr.resultHash().length())), qr.rowCount());
                queryResults.set(i, new QueryResult(
                    qr.engine(), qr.dataset(), qr.queryId(), qr.queryCategory(),
                    qr.medianMs(), qr.repetitionsMs(), qr.medianTtfrMs(), qr.repetitionsTtfrMs(),
                    qr.heapDeltaMb(), qr.rowCount(), qr.resultHash(), "MISMATCH"
                ));
            }
        }
    }

    private static boolean hasPeerMismatch(QueryResult qr, List<QueryResult> peers) {
        if (peers == null || peers.size() <= 1) {
            return false;
        }
        for (QueryResult peer : peers) {
            if (peer != qr && "PASS".equals(peer.status()) && !peer.resultHash().isEmpty()
                    && (!peer.resultHash().equals(qr.resultHash()) || peer.rowCount() != qr.rowCount())) {
                return true;
            }
        }
        return false;
    }

    private static BenchmarkOptions parseOptions(String[] args) {
        String datasetDir  = args[0];
        String outputFile  = args[1];
        List<String> engines = Arrays.asList(args[2].split(","));
        String datasetName = args.length > 3 ? args[3] : "dataset";

        String queriesFile   = null;
        boolean inference    = false;
        boolean quick        = false;
        int queryTimeoutSecs = -1;
        boolean isolate      = true;

        int i = 4;
        while (i < args.length) {
            String arg = args[i];
            if ("--inference".equals(arg)) {
                inference = true;
                i++;
            } else if ("--quick".equals(arg)) {
                quick = true;
                i++;
            } else if ("--no-isolate".equals(arg)) {
                isolate = false;
                i++;
            } else if ("--query-timeout".equals(arg) && i + 1 < args.length) {
                queryTimeoutSecs = parseTimeout(args[i + 1]);
                i += 2;
            } else if (queriesFile == null) {
                queriesFile = arg;
                i++;
            } else {
                i++;
            }
        }

        return new BenchmarkOptions(
            datasetDir, outputFile, engines, datasetName,
            queriesFile, inference, quick, queryTimeoutSecs, isolate
        );
    }

    private static int parseTimeout(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            log.warn("Invalid --query-timeout value '{}', using default", value);
            return -1;
        }
    }

    private static List<String> loadQueries(String queriesFile) {
        if (queriesFile == null) {
            return Collections.emptyList();
        }
        try {
            List<String> lines = new ArrayList<>(Files.readAllLines(Path.of(queriesFile)));
            lines.removeIf(String::isBlank);
            log.info("Loaded {} queries from: {}", lines.size(), queriesFile);
            return lines;
        } catch (Exception e) {
            log.error("Failed to read queries file {}: {}", queriesFile, e.getMessage());
            System.exit(1);
            return Collections.emptyList();
        }
    }

    private static void runEngine(
        String engineName,
        BenchmarkOptions opts,
        List<String> queries,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults
    ) {
        log.info("Starting engine: {}", engineName);
        try {
            TripleStoreDriver driver = DriverFactory.create(engineName, opts.inference());
            int reps = opts.quick() ? 1 : 3;
            BenchmarkHarness harness = opts.queryTimeoutSecs() > 0
                ? new BenchmarkHarness(driver, opts.datasetName(), reps, opts.queryTimeoutSecs())
                : new BenchmarkHarness(driver, opts.datasetName(), reps);

            List<FileResult> fileResults = harness.run(opts.datasetDir());
            allFileResults.addAll(fileResults);

            if (!queries.isEmpty()) {
                List<QueryResult> queryResults = harness.runQueryBenchmark(opts.datasetDir(), queries);
                allQueryResults.addAll(queryResults);
            }
        } catch (OutOfMemoryError e) {
            log.error("Engine {} ran out of memory on dataset '{}' — skipping to next engine", engineName, opts.datasetName(), e);
        } catch (Exception e) {
            log.error("Engine {} failed: {} — skipping to next engine", engineName, e.getMessage(), e);
        }
    }

    @SuppressWarnings("java:S5443") // Ephemeral internal IPC JSON file cleaned up in finally block
    private static void runChild(
        String engineName,
        BenchmarkOptions opts,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults
    ) {
        log.info("Launching isolated child JVM for engine: {}", engineName);
        Path tmp = null;
        Process p = null;
        try {
            tmp = Files.createTempFile("corese-bench-" + engineName.replaceAll("[^a-zA-Z0-9.-]", "_") + "-", ".json");
            List<String> cmd = buildChildCommand(opts, engineName, tmp);
            p = new ProcessBuilder(cmd).inheritIO().start();
            boolean completed = p.waitFor(CHILD_TIMEOUT_MINUTES, TimeUnit.MINUTES);
            if (!completed) {
                p.destroyForcibly();
                log.error("Engine {} timed out in isolated subprocess after {} minutes", engineName, CHILD_TIMEOUT_MINUTES);
                return;
            }
            if (p.exitValue() != 0) {
                log.error("Engine {} failed in isolated subprocess with exit code {}", engineName, p.exitValue());
                return;
            }
            readChildReport(tmp, allFileResults, allQueryResults);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Isolated execution interrupted for engine: {}", engineName);
        } catch (Exception e) {
            log.error("Failed to run isolated subprocess for engine {}: {}", engineName, e.getMessage(), e);
        } finally {
            if (p != null && p.isAlive()) {
                p.destroyForcibly();
            }
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (Exception ignored) {
                    // Ignore temp file cleanup failure
                }
            }
        }
    }

    private static void readChildReport(
        Path tmp,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults
    ) throws Exception {
        if (!Files.exists(tmp)) {
            return;
        }
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(tmp.toFile());
        if (root.has("loadingRuns")) {
            FileResult[] frs = mapper.treeToValue(root.get("loadingRuns"), FileResult[].class);
            allFileResults.addAll(Arrays.asList(frs));
        } else if (root.has("runs")) {
            FileResult[] frs = mapper.treeToValue(root.get("runs"), FileResult[].class);
            allFileResults.addAll(Arrays.asList(frs));
        }
        if (root.has("queryRuns")) {
            QueryResult[] qrs = mapper.treeToValue(root.get("queryRuns"), QueryResult[].class);
            allQueryResults.addAll(Arrays.asList(qrs));
        }
    }

    private static List<String> buildChildCommand(BenchmarkOptions opts, String engineName, Path tempOutput) {
        List<String> cmd = new ArrayList<>();
        String javaBin = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        cmd.add(javaBin);
        cmd.add("-Xms4g");
        cmd.add("-Xmx8g");
        cmd.add("-XX:+UseG1GC");
        cmd.add("-cp");
        cmd.add(System.getProperty("java.class.path"));
        cmd.add("fr.inria.corese.benchmark.Main");
        cmd.add(opts.datasetDir());
        cmd.add(tempOutput.toString());
        cmd.add(engineName);
        cmd.add(opts.datasetName());
        if (opts.queriesFile() != null) {
            cmd.add(opts.queriesFile());
        }
        if (opts.inference()) {
            cmd.add("--inference");
        }
        if (opts.quick()) {
            cmd.add("--quick");
        }
        if (opts.queryTimeoutSecs() > 0) {
            cmd.add("--query-timeout");
            cmd.add(String.valueOf(opts.queryTimeoutSecs()));
        }
        cmd.add("--no-isolate");
        return cmd;
    }
}
