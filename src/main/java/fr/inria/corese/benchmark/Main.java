package fr.inria.corese.benchmark;

import fr.inria.corese.benchmark.driver.DriverFactory;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.harness.BenchmarkHarness;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.report.BenchmarkReport;

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

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: benchmark <datasetDir> <outputFile> <engine1,engine2,...> [datasetName]");
            System.exit(1);
        }

        String datasetDir  = args[0];
        String outputFile  = args[1];
        String[] engines   = args[2].split(",");
        String datasetName = args.length > 3 ? args[3] : "dataset";

        List<FileResult> allResults = new ArrayList<>();

        for (String engineName : engines) {
            engineName = engineName.trim();
            System.out.println("\nStarting engine: " + engineName);

            TripleStoreDriver driver = DriverFactory.create(engineName);
            BenchmarkHarness harness = new BenchmarkHarness(driver, datasetName);
            List<FileResult> results = harness.run(datasetDir);
            allResults.addAll(results);
        }

        BenchmarkReport.write(allResults, outputFile);
    }
}
