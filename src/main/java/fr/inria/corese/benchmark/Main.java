package fr.inria.corese.benchmark;

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

/**
 * Entry point for the benchmark harness.
 */
public class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    private record BenchmarkOptions(
        String datasetDir,
        String outputFile,
        List<String> engines,
        String datasetName,
        String queriesFile,
        boolean inference,
        boolean quick,
        int queryTimeoutSecs
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

        for (String engineName : opts.engines()) {
            runEngine(engineName.trim(), opts, queries, allFileResults, allQueryResults);
        }

        try {
            BenchmarkReport.write(allFileResults, allQueryResults, queries, opts.outputFile());
        } catch (Exception e) {
            log.error("Failed to write report: {}", e.getMessage(), e);
            System.exit(1);
        }
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

        int i = 4;
        while (i < args.length) {
            String arg = args[i];
            if ("--inference".equals(arg)) {
                inference = true;
                i++;
            } else if ("--quick".equals(arg)) {
                quick = true;
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
            queriesFile, inference, quick, queryTimeoutSecs
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
}
