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
import java.util.concurrent.*;

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
    private static final int QUERY_REPS = 3;
    private static final long QUERY_TIMEOUT_S = 30; // seconds per query execution

    private final TripleStoreDriver driver;
    private final MetricsCollector metrics;
    private final String datasetName;

    /**
     * Constructs a harness for the given driver and dataset.
     *
     * @param driver      the triple-store driver to benchmark
     * @param datasetName logical name of the dataset (recorded in result objects)
     */
    public BenchmarkHarness(TripleStoreDriver driver, String datasetName) {
        this.driver = driver;
        this.datasetName = datasetName;
        this.metrics = new MetricsCollector();
    }

    /**
     * Runs the load benchmark over all {@code .nt} files found in {@code datasetDir}.
     * Files are sorted alphabetically. For each file the harness performs one warmup
     * load followed by {@value #REPETITIONS} measured repetitions, keeping the median.
     * The driver is initialised at the start and closed in a {@code finally} block.
     *
     * @param datasetDir path to the directory containing {@code .nt} files
     * @return one {@link FileResult} per file, in sorted file order
     * @throws IllegalArgumentException if no {@code .nt} files are found
     * @throws Exception                if the driver or file I/O raises an error
     */
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
            log.info("=== Benchmark: {} | Dataset: {} | {} file(s) ===", driver.getName(), datasetName, files.length);
            for (int fi = 0; fi < files.length; fi++) {
                File file = files[fi];
                try {
                    FileResult result = benchmarkFile(file);
                    results.add(result);
                    long[] reps = result.repetitionsMs();
                    String repStr = String.format("[%d, %d, %d]", reps[0], reps[1], reps[2]);
                    log.info("  [{}/{}] {}", fi + 1, files.length,
                            String.format(Locale.US, "%-45s | %6d ms %s | %,9d triples | %8.1f MB | %,.0f triples/s",
                                    file.getName(), result.loadingTimeMs(), repStr,
                                    result.triples(), result.memoryDeltaMb(), result.throughputTriplesPerSec()));
                } catch (OutOfMemoryError e) {
                    System.gc();
                    log.error("  [{}/{}] {} — OUT OF MEMORY, skipping file", fi + 1, files.length, file.getName(), e);
                }
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

            // Benchmark each query with per-execution timeout
            try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
                for (int qi = 0; qi < queries.size(); qi++) {
                    String sparql = queries.get(qi).trim();
                    if (sparql.isEmpty()) continue;
                    String queryId = "query_" + (qi + 1);

                    long[] times = new long[QUERY_REPS];
                    for (int i = 0; i < QUERY_REPS; i++) {
                        final String q = sparql;
                        Future<Long> future = executor.submit(() -> driver.query(q));
                        try {
                            times[i] = future.get(QUERY_TIMEOUT_S, TimeUnit.SECONDS);
                        } catch (TimeoutException e) {
                            future.cancel(true);
                            log.warn("  {} rep {} timed out after {}s", queryId, i + 1, QUERY_TIMEOUT_S);
                            times[i] = -1L;
                        } catch (ExecutionException e) {
                            log.warn("  {} rep {} failed: {}", queryId, i + 1, e.getCause().getMessage());
                            times[i] = -1L;
                        }
                    }
                    long medianMs = MetricsCollector.median(times);
                    results.add(new QueryResult(driver.getName(), datasetName, queryId, medianMs, times));
                    log.info("  {} | {} ms", queryId, medianMs >= 0 ? medianMs : "TIMEOUT");
                }
            }
        } finally {
            driver.close();
        }
        return results;
    }

    /**
     * Benchmarks a single N-Triples file: one warmup followed by
     * {@value #REPETITIONS} measured load cycles. Memory is sampled before and
     * after each load (with forced GC), and CPU usage is sampled immediately after.
     * Median values are computed across the repetitions and returned as a
     * {@link FileResult}.
     *
     * @param file the N-Triples file to benchmark
     * @return the aggregated {@link FileResult} for this file
     * @throws Exception if the driver raises an error during load or measurement
     */
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

            long start = System.nanoTime();
            driver.load(path);
            timesMs[i] = (System.nanoTime() - start) / 1_000_000L;

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
