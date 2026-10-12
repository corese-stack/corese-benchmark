package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.metrics.QueryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

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

    private static final Logger log = LoggerFactory.getLogger(BenchmarkHarness.class);
    private static final int REPETITIONS = 3;
    private static final int QUERY_REPS  = 3;

    private final TripleStoreDriver driver;
    private final MetricsCollector metrics;
    private final String datasetName;

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName) {
        this.driver = driver;
        this.datasetName = datasetName;
        this.metrics = new MetricsCollector();
    }

    public List<FileResult> run(String datasetDir) throws Exception {
        File dir = new File(datasetDir);
        File[] files = dir.listFiles(f -> f.getName().endsWith(".nt"));
        if (files == null || files.length == 0) {
            throw new IllegalArgumentException("No .nt files found in: " + datasetDir);
        }
        Arrays.sort(files);

        List<FileResult> results = new ArrayList<>();
        driver.init();
        try {
            log.info("=== Benchmark: {} | Dataset: {} ===", driver.getName(), datasetName);
            for (File file : files) {
                FileResult result = benchmarkFile(file);
                results.add(result);
                log.info("  {}", String.format(Locale.US,
                    "%-45s | %6d ms | %8.1f MB | %,.0f triples/s",
                    file.getName(), result.loadingTimeMs(),
                    result.memoryDeltaMb(), result.throughputTriplesPerSec()));
            }
        } finally {
            driver.close();
        }
        return results;
    }

    /**
     * Load all dataset files once, then run each SPARQL query QUERY_REPS times.
     * Returns one QueryResult per (engine, query).
     */
    public List<QueryResult> runQueryBenchmark(String datasetDir, List<String> queries) throws Exception {
        File dir = new File(datasetDir);
        File[] files = dir.listFiles(f -> f.getName().endsWith(".nt"));
        if (files == null || files.length == 0) {
            throw new IllegalArgumentException("No .nt files found in: " + datasetDir);
        }
        Arrays.sort(files);

        List<QueryResult> results = new ArrayList<>();
        driver.init();
        try {
            log.info("=== Query Benchmark: {} | Dataset: {} ===", driver.getName(), datasetName);

            // Load all files once
            log.info("  Loading {} file(s)...", files.length);
            for (File file : files) {
                driver.load(file.getAbsolutePath());
            }
            log.info("  {} triples loaded — running {} queries × {} reps",
                driver.getGraphSize(), queries.size(), QUERY_REPS);

            // Benchmark each query
            for (int qi = 0; qi < queries.size(); qi++) {
                String sparql = queries.get(qi).trim();
                if (sparql.isEmpty()) continue;
                String queryId = "query_" + (qi + 1);

                long[] times = new long[QUERY_REPS];
                for (int i = 0; i < QUERY_REPS; i++) {
                    try {
                        times[i] = driver.query(sparql);
                    } catch (Exception e) {
                        log.warn("  {} rep {} failed: {}", queryId, i + 1, e.getMessage());
                        times[i] = -1L;
                    }
                }
                long medianMs = MetricsCollector.median(times);
                results.add(new QueryResult(driver.getName(), datasetName, queryId, medianMs, times));
                log.info("  {} | {} ms", queryId, medianMs);
            }
        } finally {
            driver.close();
        }
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
        long[] timesMs   = new long[REPETITIONS];
        double[] memBefore  = new double[REPETITIONS];
        double[] memAfter   = new double[REPETITIONS];
        double[] cpuSamples = new double[REPETITIONS];
        long triples = 0;

        for (int i = 0; i < REPETITIONS; i++) {
            driver.clear();
            memBefore[i] = metrics.getUsedMemoryMb();

            long start = System.currentTimeMillis();
            driver.load(path);
            timesMs[i] = System.currentTimeMillis() - start;

            cpuSamples[i] = metrics.getCpuPercent();
            memAfter[i]   = metrics.getUsedMemoryMb();
            triples       = driver.getGraphSize();
        }

        // --- Compute medians ---
        long medianTimeMs = MetricsCollector.median(timesMs);

        double[] deltas = new double[REPETITIONS];
        for (int i = 0; i < REPETITIONS; i++) deltas[i] = memAfter[i] - memBefore[i];

        return new FileResult(
            driver.getName(),
            datasetName,
            file.getName(),
            triples,
            medianTimeMs,
            MetricsCollector.throughput(triples, medianTimeMs),
            MetricsCollector.medianDouble(memBefore),
            MetricsCollector.medianDouble(memAfter),
            MetricsCollector.medianDouble(deltas),
            MetricsCollector.medianDouble(cpuSamples),
            timesMs
        );
    }
}
