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
 * Usage:
 *   java -jar benchmark.jar <datasetDir> <outputFile> <engine1,engine2,...> [datasetName]
 * Examples:
 *   java -jar benchmark.jar input/unzip out/report.json corese.4.6.3,jena.5.2.0 dbpedia
 *   java -jar benchmark.jar input/unzip out/report.json corese.local corese-next
 */
public class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);

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
            } catch (Exception e) {
                log.error("Engine {} failed: {} — skipping to next engine", engineName, e.getMessage(), e);
            }
        }

        try {
            BenchmarkReport.write(allFileResults, allQueryResults, outputFile);
        } catch (Exception e) {
            log.error("Failed to write report: {}", e.getMessage(), e);
            System.exit(1);
        }
    }
}
