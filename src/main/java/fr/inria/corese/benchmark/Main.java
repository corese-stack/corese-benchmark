package fr.inria.corese.benchmark;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.inria.corese.benchmark.driver.DriverFactory;
import fr.inria.corese.benchmark.driver.BenchmarkFormat;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.harness.BenchmarkHarness;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
import fr.inria.corese.benchmark.query.SparqlCatalogueLoader;
import fr.inria.corese.benchmark.query.SparqlCatalogueLoader.LoadedQuery;
import fr.inria.corese.benchmark.query.SparqlQueryDefinition;
import fr.inria.corese.benchmark.report.BenchmarkProtocol;
import fr.inria.corese.benchmark.report.BenchmarkReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.concurrent.TimeUnit;

/**
 * Entry point for the benchmark harness.
 * Supports running multiple engines sequentially in isolated child JVM processes
 * to prevent JIT and GC cross-contamination.
 */
public class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);
    private static final String KEY_METADATA = "metadata";
    private static final String OPT_FORMATS = "--formats";
    private static final String OPT_FORMATS_EQ = "--formats=";
    private static final long DEFAULT_CHILD_TIMEOUT_MINUTES = 45;
    private static final long BOWLOGNA_CHILD_TIMEOUT_MINUTES = 120;

    private static long resolveChildTimeoutMinutes(String datasetName) {
        if ("bowlogna".equalsIgnoreCase(datasetName)) {
            return BOWLOGNA_CHILD_TIMEOUT_MINUTES;
        }
        return DEFAULT_CHILD_TIMEOUT_MINUTES;
    }

    private static void terminateProcessTree(Process p) {
        if (p == null) return;
        List<ProcessHandle> descendants = Collections.emptyList();
        try {
            descendants = p.descendants().toList();
        } catch (Exception e) {
            log.debug("Could not snapshot process descendants: {}", e.getMessage());
        }
        for (ProcessHandle ph : descendants) {
            try {
                ph.destroyForcibly();
            } catch (Exception _) {
                // Best effort per-descendant signal
            }
        }
        try {
            p.destroyForcibly();
        } catch (Exception _) {
            // Best effort root process signal
        }
        for (ProcessHandle ph : descendants) {
            try {
                ph.onExit().get(2, TimeUnit.SECONDS);
            } catch (InterruptedException _) {
                Thread.currentThread().interrupt();
            } catch (Exception _) {
                // Timeout waiting on child exit
            }
        }
        try {
            p.waitFor(3, TimeUnit.SECONDS);
        } catch (InterruptedException _) {
            Thread.currentThread().interrupt();
        } catch (Exception _) {
            // Timeout waiting on root exit
        }
    }

    public enum BenchmarkMode {
        ALL,
        LOAD,
        QUERY;

        public static BenchmarkMode fromString(String val) {
            if (val == null || val.isBlank()) {
                throw new IllegalArgumentException("Benchmark mode must not be null or blank");
            }
            try {
                return BenchmarkMode.valueOf(val.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException(
                    "Invalid benchmark mode: '" + val + "'. Allowed values are: all, load, query", e
                );
            }
        }

        public boolean includesLoad() {
            return this == ALL || this == LOAD;
        }

        public boolean includesQuery() {
            return this == ALL || this == QUERY;
        }
    }

    private record BenchmarkOptions(
        String datasetDir,
        String outputFile,
        List<String> engines,
        String datasetName,
        String queriesFile,
        boolean inference,
        boolean quick,
        int queryTimeoutSecs,
        boolean isolateProcess,
        BenchmarkMode mode,
        Set<BenchmarkFormat> formats
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
     *   <li>{@code queriesFile}  — (optional) path to a catalogue JSON, multiline .rq, or legacy one-query-per-line file</li>
     *   <li>{@code --mode}       — (optional) {@code all}, {@code load}, or {@code query} (default: {@code all})</li>
     *   <li>{@code --formats}    — (optional) comma-separated canonical dataset formats; empty selects all</li>
     *   <li>{@code --inference}  — (optional flag) enables OWL-RL inference for Corese drivers</li>
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
        // Fail-Fast: validate entire engine matrix before launching benchmarks
        for (String engineName : opts.engines()) {
            try {
                fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.verifyEngineName(engineName.trim());
            } catch (IllegalArgumentException e) {
                log.error("Engine matrix validation failed: {}", e.getMessage());
                System.exit(1);
                return;
            }
        }
        QueryInput queryInput = new QueryInput(Collections.emptyList(), null);
        if (opts.mode().includesQuery() && opts.queriesFile() != null) {
            try {
                queryInput = loadQueries(opts.queriesFile(), opts.datasetName());
            } catch (IOException e) {
                log.error("Failed to read queries file {}: {}", opts.queriesFile(), e.getMessage());
                System.exit(1);
                return;
            }
        }
        List<String> queries = queryInput.queries();

        List<FileResult> allFileResults = new ArrayList<>();
        List<QueryResult> allQueryResults = new ArrayList<>();
        Map<String, Object> childEnvironment = new LinkedHashMap<>();

        BenchmarkProtocol proto = BenchmarkProtocol.fromOptions(opts.quick(), opts.queryTimeoutSecs());
        boolean shouldIsolate = opts.isolateProcess();
        for (String engineName : opts.engines()) {
            String cleanName = engineName.trim();
            if (shouldIsolate) {
                runChild(cleanName, opts, allFileResults, allQueryResults, childEnvironment);
            } else {
                runEngine(cleanName, opts, queryInput, allFileResults, allQueryResults, proto);
            }
        }

        crossValidateQueries(allQueryResults);

        try {
            BenchmarkReport.write(allFileResults, allQueryResults, queries, opts.outputFile(), proto, childEnvironment.isEmpty() ? null : childEnvironment);
        } catch (Exception e) {
            log.error("Failed to write report: {}", e.getMessage(), e);
            System.exit(1);
        }
    }

    private enum PeerComparison {
        MATCH,
        MISMATCH,
        INCONCLUSIVE
    }

    public static void crossValidateQueries(List<QueryResult> queryResults) {
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
            PeerComparison comparison = evaluatePeerComparison(qr, peers);
            if (comparison == PeerComparison.MISMATCH) {
                if (log.isWarnEnabled()) {
                    log.warn("Cross-engine mismatch detected for query {} on dataset {}: engine {} produced hash {} (rows: {})",
                        qr.queryId(), qr.dataset(), qr.engine(), qr.resultHash().substring(0, Math.min(8, qr.resultHash().length())), qr.rowCount());
                }
                queryResults.set(i, withStatus(qr, "MISMATCH"));
            } else if (comparison == PeerComparison.INCONCLUSIVE) {
                log.info("Cross-engine comparison inconclusive for query {} on dataset {}: blank nodes present with matching row counts (rows: {})",
                    qr.queryId(), qr.dataset(), qr.rowCount());
                queryResults.set(i, withStatus(qr, "INCONCLUSIVE"));
            }
        }
    }

    private static PeerComparison evaluatePeerComparison(QueryResult qr, List<QueryResult> peers) {
        if (peers == null || peers.size() <= 1) {
            return PeerComparison.MATCH;
        }
        PeerComparison overall = PeerComparison.MATCH;
        for (QueryResult peer : peers) {
            PeerComparison c = comparePeers(qr, peer);
            if (c == PeerComparison.MISMATCH) {
                return PeerComparison.MISMATCH;
            }
            if (c == PeerComparison.INCONCLUSIVE) {
                overall = PeerComparison.INCONCLUSIVE;
            }
        }
        return overall;
    }

    private static PeerComparison comparePeers(QueryResult qr, QueryResult peer) {
        if (peer == qr || !"PASS".equals(peer.status())) {
            return PeerComparison.MATCH;
        }
        if (qr.resultHash().isEmpty() || peer.resultHash().isEmpty() || peer.rowCount() < 0 || qr.rowCount() < 0) {
            return PeerComparison.MATCH;
        }
        if (peer.rowCount() != qr.rowCount()) {
            return PeerComparison.MISMATCH;
        }
        if (peer.resultHash().equals(qr.resultHash())) {
            return PeerComparison.MATCH;
        }
        if (qr.hasBlankNodes() || peer.hasBlankNodes()) {
            return PeerComparison.INCONCLUSIVE;
        }
        return PeerComparison.MISMATCH;
    }

    private static QueryResult withStatus(QueryResult qr, String newStatus) {
        return new QueryResult(
            qr.engine(), qr.dataset(), qr.queryId(), qr.queryCategory(),
            qr.medianMs(), qr.repetitionsMs(), qr.medianTtfrMs(), qr.repetitionsTtfrMs(),
            qr.heapDeltaMb(), qr.rowCount(), qr.resultHash(), newStatus,
            qr.repetitionsStatuses(), qr.repetitionErrors(), qr.hasBlankNodes()
        );
    }

    private static final class OptionBuilder {
        String queriesFile;
        boolean inference;
        boolean quick;
        int queryTimeoutSecs = -1;
        boolean isolate = true;
        BenchmarkMode mode = BenchmarkMode.ALL;
        Set<BenchmarkFormat> formats = Set.of();
    }

    private static BenchmarkOptions parseOptions(String[] args) {
        String datasetDir = args[0];
        String outputFile = args[1];
        List<String> engines = Arrays.asList(args[2].split(","));
        boolean hasDatasetName = args.length > 3 && !args[3].startsWith("--");
        String datasetName = hasDatasetName ? args[3] : "dataset";

        OptionBuilder parsed = new OptionBuilder();
        int i = hasDatasetName ? 4 : 3;
        while (i < args.length) {
            i += parseSingleOption(args, i, parsed);
        }

        return new BenchmarkOptions(
            datasetDir, outputFile, engines, datasetName,
            parsed.queriesFile, parsed.inference, parsed.quick,
            parsed.queryTimeoutSecs, parsed.isolate, parsed.mode, parsed.formats
        );
    }

    private static int parseSingleOption(String[] args, int index, OptionBuilder out) {
        String arg = args[index];
        if (arg.startsWith(OPT_FORMATS_EQ)) {
            out.formats = BenchmarkFormat.parseFormatList(arg.substring(OPT_FORMATS_EQ.length()));
            return 1;
        }
        if (OPT_FORMATS.equals(arg)) {
            out.formats = BenchmarkFormat.parseFormatList(requireOptionValue(args, index, OPT_FORMATS));
            return 2;
        }
        if ("--inference".equals(arg)) {
            out.inference = true;
            return 1;
        }
        if ("--quick".equals(arg)) {
            out.quick = true;
            return 1;
        }
        if ("--no-isolate".equals(arg)) {
            out.isolate = false;
            return 1;
        }
        if ("--query-timeout".equals(arg) && index + 1 < args.length) {
            out.queryTimeoutSecs = parseTimeout(args[index + 1]);
            return 2;
        }
        if (("--benchmark-type".equals(arg) || "--mode".equals(arg)) && index + 1 < args.length) {
            out.mode = parseMode(args[index + 1]);
            return 2;
        }
        if (out.queriesFile == null && !arg.startsWith("--")) {
            out.queriesFile = arg;
        }
        return 1;
    }

    private static String requireOptionValue(String[] args, int index, String flag) {
        if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
            throw new IllegalArgumentException("Missing value for " + flag);
        }
        return args[index + 1];
    }

    private static BenchmarkMode parseMode(String value) {
        return BenchmarkMode.fromString(value);
    }

    private static int parseTimeout(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException _) {
            log.warn("Invalid --query-timeout value '{}', using default", value);
            return -1;
        }
    }

    record QueryInput(List<String> queries, List<LoadedQuery> catalogue) { }

    /**
     * Dataset labels select catalogue entries (case-insensitive); the default
     * label "dataset" selects the complete catalogue. Legacy text is unchanged.
     * Standalone .rq files use their basename as ID and a 30-second timeout.
     */
    static QueryInput loadQueries(String queriesFile, String datasetName) throws IOException {
        if (queriesFile == null) {
            return new QueryInput(Collections.emptyList(), null);
        }
        Path path = Path.of(queriesFile);
        if (!queriesFile.endsWith(".rq")
                && (queriesFile.endsWith(".json") || queriesFile.contains("catalogue"))) {
            List<LoadedQuery> loaded = new SparqlCatalogueLoader().load(path).stream()
                    .filter(query -> "dataset".equals(datasetName)
                            || query.definition().dataset().equalsIgnoreCase(datasetName))
                    .toList();
            log.info("Loaded {} catalogue queries for {} from: {}", loaded.size(), datasetName, path);
            return new QueryInput(loaded.stream().map(LoadedQuery::sparql).toList(), loaded);
        }
        if (queriesFile.endsWith(".rq")) {
            String sparql = Files.readString(path);
            if (sparql.isBlank()) {
                throw new IOException("Empty query file: " + path);
            }
            String file = path.getFileName().toString();
            String id = file.substring(0, file.length() - 3);
            var definition = new SparqlQueryDefinition(id, id, file, datasetName,
                    SparqlAnalyser.classifyFeature(sparql, null), List.of(), 30, "unordered_exact");
            return new QueryInput(List.of(sparql), List.of(new LoadedQuery(definition, sparql)));
        }
        List<String> lines = new ArrayList<>(Files.readAllLines(path));
        lines.removeIf(String::isBlank);
        log.info("Loaded {} queries from: {}", lines.size(), queriesFile);
        return new QueryInput(lines, null);
    }

    private static void runEngine(
        String engineName,
        BenchmarkOptions opts,
        QueryInput queryInput,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults,
        BenchmarkProtocol protocol
    ) {
        log.info("Starting engine: {}", engineName);
        try {
            TripleStoreDriver driver = DriverFactory.create(engineName, opts.inference());
            BenchmarkHarness harness = new BenchmarkHarness(driver, opts.datasetName(), protocol, opts.formats());

            if (opts.mode().includesLoad()) {
                List<FileResult> fileResults = harness.run(opts.datasetDir());
                allFileResults.addAll(fileResults);
            }

            if (opts.mode().includesQuery() && !queryInput.queries().isEmpty()) {
                List<QueryResult> queryResults = queryInput.catalogue() == null
                        ? harness.runQueryBenchmark(opts.datasetDir(), queryInput.queries())
                        : harness.runCatalogueBenchmark(opts.datasetDir(), queryInput.catalogue());
                allQueryResults.addAll(queryResults);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Execution failed for engine " + engineName + " on dataset " + opts.datasetName(), e);
        }
    }

    @SuppressWarnings("java:S5443") // Ephemeral internal IPC JSON file cleaned up in finally block
    private static void runChild(
        String engineName,
        BenchmarkOptions opts,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults,
        Map<String, Object> childEnvironment
    ) {
        log.info("Launching isolated child JVM for engine: {}", engineName);
        Path tmp = null;
        Process p = null;
        try {
            tmp = Files.createTempFile("corese-bench-" + engineName.replaceAll("[^a-zA-Z0-9.-]", "_") + "-", ".json");
            List<String> cmd = buildChildCommand(opts, engineName, tmp);
            p = new ProcessBuilder(cmd).inheritIO().start();
            long timeoutMinutes = resolveChildTimeoutMinutes(opts.datasetName());
            boolean completed = p.waitFor(timeoutMinutes, TimeUnit.MINUTES);
            if (!completed) {
                terminateProcessTree(p);
                throw new IllegalStateException("Subprocess execution timed out for engine " + engineName + " after " + timeoutMinutes + " minutes");
            } else if (p.exitValue() != 0) {
                throw new IllegalStateException("Subprocess execution failed for engine " + engineName + " with exit code " + p.exitValue());
            }
            // Even if process failed partway through (e.g. OOM on one file), salvage whatever runs were recorded
            readChildReport(tmp, allFileResults, allQueryResults, childEnvironment);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            terminateProcessTree(p);
            throw new IllegalStateException("Execution interrupted for engine " + engineName, e);
        } catch (Exception e) {
            terminateProcessTree(p);
            throw (e instanceof RuntimeException re) ? re : new IllegalStateException("Failed to run isolated subprocess for engine " + engineName, e);
        } finally {
            terminateProcessTree(p);
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (Exception _) {
                    // Ignore temp file cleanup failure
                }
            }
        }
    }

    private static void readChildReport(
        Path tmp,
        List<FileResult> allFileResults,
        List<QueryResult> allQueryResults,
        Map<String, Object> childEnvironment
    ) throws IOException {
        if (!Files.exists(tmp)) {
            return;
        }
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        JsonNode root = mapper.readTree(tmp.toFile());
        if (childEnvironment.isEmpty() && root.has(KEY_METADATA) && root.get(KEY_METADATA).has("environment")) {
            JsonNode envNode = root.get(KEY_METADATA).get("environment");
            Map<String, Object> envMap = mapper.convertValue(envNode, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            if (envMap != null) {
                childEnvironment.putAll(envMap);
            }
        }
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
        if (opts.mode() != BenchmarkMode.ALL) {
            cmd.add("--mode");
            cmd.add(opts.mode().name().toLowerCase(Locale.ROOT));
        }
        if (!opts.formats().isEmpty()) {
            cmd.add(OPT_FORMATS);
            cmd.add(opts.formats().stream().map(BenchmarkFormat::getExtension).collect(Collectors.joining(",")));
        }
        cmd.add("--no-isolate");
        return cmd;
    }
}
