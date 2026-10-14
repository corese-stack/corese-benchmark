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
import java.util.List;

/**
 * Entry point for the benchmark harness.
 */
public class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    /**
     * Parses command-line arguments, runs the load and (optionally) query benchmarks
     * for each specified engine, then writes the combined report.
     *
     * <p>Arguments:
     * <ol>
     *   <li>{@code datasetDir}   — directory containing {@code .nt} files</li>
     *   <li>{@code outputFile}   — path for the generated JSON report</li>
     *   <li>{@code engines}      — comma-separated engine names (e.g. {@code corese.4.6.3,jena.5.2.0})</li>
     *   <li>{@code datasetName}  — (optional) logical dataset label; defaults to {@code "dataset"}</li>
     *   <li>{@code queriesFile}  — (optional) path to a file with one SPARQL query per line</li>
     *   <li>{@code --inference}  — (optional flag) enables RDFS inference for Corese drivers</li>
     * </ol>
     *
     * <p>If an engine fails, the error is logged and the harness continues with the next engine.
     * The process exits with status 1 if the report cannot be written or if fewer than
     * 3 arguments are supplied.
     *
     * @param args command-line arguments as described above
     */
    public static void main(String[] args) {
        if (args.length < 3) {
            log.error("Usage: benchmark <datasetDir> <outputFile> <engine1,engine2,...> [datasetName] [queriesFile]");
            System.exit(1);
        }

        String datasetDir  = args[0];
        String outputFile  = args[1];
        String[] engines   = args[2].split(",");
        String datasetName = args.length > 3 ? args[3] : "dataset";

        // Parse remaining args: optional queries file and --inference flag
        String queriesFile = null;
        boolean inference  = false;
        for (int i = 4; i < args.length; i++) {
            if ("--inference".equals(args[i])) {
                inference = true;
            } else if (queriesFile == null) {
                queriesFile = args[i];
            }
        }

        List<String> queries = new ArrayList<>();
        if (queriesFile != null) {
            try {
                queries = Files.readAllLines(Path.of(queriesFile));
                queries.removeIf(String::isBlank);
                log.info("Loaded {} queries from: {}", queries.size(), queriesFile);
            } catch (Exception e) {
                log.error("Failed to read queries file {}: {}", queriesFile, e.getMessage());
                System.exit(1);
            }
        }

        List<FileResult>  allFileResults  = new ArrayList<>();
        List<QueryResult> allQueryResults = new ArrayList<>();

        for (String engineName : engines) {
            engineName = engineName.trim();
            log.info("Starting engine: {}", engineName);
            try {
                TripleStoreDriver driver = DriverFactory.create(engineName, inference);
                BenchmarkHarness harness = new BenchmarkHarness(driver, datasetName);

                // Load benchmark
                List<FileResult> fileResults = harness.run(datasetDir);
                allFileResults.addAll(fileResults);

                // Query benchmark (optional)
                if (!queries.isEmpty()) {
                    List<QueryResult> queryResults = harness.runQueryBenchmark(datasetDir, queries);
                    allQueryResults.addAll(queryResults);
                }
            } catch (OutOfMemoryError e) {
                System.gc();
                log.error("Engine {} ran out of memory — skipping to next engine", engineName, e);
            } catch (Exception e) {
                log.error("Engine {} failed: {} — skipping to next engine", engineName, e.getMessage(), e);
            }
        }

        try {
            BenchmarkReport.write(allFileResults, allQueryResults, queries, outputFile);
        } catch (Exception e) {
            log.error("Failed to write report: {}", e.getMessage(), e);
            System.exit(1);
        }
    }
}
