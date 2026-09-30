package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.MetricsCollector;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Benchmark harness: orchestrates warmup + 3 repetitions + median for each file.
 * Protocol per file:
 *   1. Warmup: load → clear → gc (discarded)
 *   2. Repeat 3 times:
 *      - gc + memory snapshot before
 *      - load
 *      - gc + memory snapshot after
 *      - record time and memory delta
 *   3. Keep the median of 3 repetitions
 */
public class BenchmarkHarness {

    private static final int REPETITIONS = 3;

    private final TripleStoreDriver driver;
    private final MetricsCollector metrics;
    private final String datasetName;

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName) {
        this.driver = driver;
        this.datasetName = datasetName;
        this.metrics = new MetricsCollector();
    }

    public List<FileResult> run(String datasetDir) throws Exception {
        List<FileResult> results = new ArrayList<>();

        File dir = new File(datasetDir);
        File[] files = dir.listFiles(f -> f.getName().endsWith(".nt"));
        if (files == null || files.length == 0) {
            throw new IllegalArgumentException("No .nt files found in: " + datasetDir);
        }
        Arrays.sort(files);

        driver.init();
        System.out.printf("=== Benchmark: %s | Dataset: %s ===%n", driver.getName(), datasetName);

        for (File file : files) {
            FileResult result = benchmarkFile(file);
            results.add(result);
            System.out.printf("  %-45s | %6d ms | %8.1f MB | %,.0f triples/s%n",
                file.getName(),
                result.loadingTimeMs,
                result.memoryDeltaMb,
                result.throughputTriplesPerSec);
        }

        driver.close();
        return results;
    }

    private FileResult benchmarkFile(File file) throws Exception {
        String path = file.getAbsolutePath();

        // --- Warmup (discarded) ---
        driver.clear();
        System.gc();
        driver.load(path);
        driver.clear();
        System.gc();

        // --- 3 repetitions ---
        long[] timesMs = new long[REPETITIONS];
        double[] memBefore = new double[REPETITIONS];
        double[] memAfter = new double[REPETITIONS];
        double[] cpuSamples = new double[REPETITIONS];
        long triples = 0;

        for (int i = 0; i < REPETITIONS; i++) {
            driver.clear();
            memBefore[i] = metrics.getUsedMemoryMb(); // forces GC before snapshot

            long start = System.currentTimeMillis();
            driver.load(path);
            timesMs[i] = System.currentTimeMillis() - start;

            cpuSamples[i] = metrics.getCpuPercent();
            memAfter[i] = metrics.getUsedMemoryMb(); // forces GC after snapshot

            triples = driver.getGraphSize();
        }

        // --- Compute medians ---
        long medianTimeMs = MetricsCollector.median(timesMs);

        double[] deltas = new double[REPETITIONS];
        for (int i = 0; i < REPETITIONS; i++) {
            deltas[i] = memAfter[i] - memBefore[i];
        }
        double medianDelta = medianDouble(deltas);
        double medianBefore = medianDouble(memBefore);
        double medianAfter = medianDouble(memAfter);
        double medianCpu = medianDouble(cpuSamples);

        // --- Build result ---
        FileResult result = new FileResult();
        result.engine = driver.getName();
        result.dataset = datasetName;
        result.file = file.getName();
        result.triples = triples;
        result.loadingTimeMs = medianTimeMs;
        result.throughputTriplesPerSec = MetricsCollector.throughput(triples, medianTimeMs);
        result.memoryBeforeMb = medianBefore;
        result.memoryAfterMb = medianAfter;
        result.memoryDeltaMb = medianDelta;
        result.cpuPercent = medianCpu;
        result.repetitionsMs = timesMs;

        return result;
    }

    private double medianDouble(double[] values) {
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 0
            ? (sorted[mid - 1] + sorted[mid]) / 2.0
            : sorted[mid];
    }
}
