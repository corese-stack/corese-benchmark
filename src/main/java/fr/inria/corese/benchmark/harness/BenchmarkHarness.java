package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.QueryMetrics;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
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
    private final int repetitions;
    private static final int QUERY_REPS = 3;
    private static final long DEFAULT_QUERY_TIMEOUT_S  = 30; // seconds per query execution
    private static final long LOAD_TIMEOUT_MINUTES     = 10; // minutes per file load
    private final long queryTimeoutS;

    private final TripleStoreDriver driver;
    private final MetricsCollector metrics;
    private final String datasetName;

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName, int repetitions) {
        this(driver, datasetName, repetitions, DEFAULT_QUERY_TIMEOUT_S);
    }

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName, int repetitions, long queryTimeoutS) {
        this.driver = driver;
        this.datasetName = datasetName;
        this.repetitions = repetitions;
        this.queryTimeoutS = queryTimeoutS;
        this.metrics = new MetricsCollector();
    }

    /**
     * Runs the load benchmark over all {@code .nt} files found in {@code datasetDir}.
     * Files are sorted alphabetically. For each file the harness performs one warmup
     * load followed by REPETITIONS measured repetitions, keeping the median.
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
                    StringBuilder sb = new StringBuilder("[");
                    for (int r = 0; r < reps.length; r++) { if (r > 0) sb.append(", "); sb.append(reps[r]); }
                    sb.append("]");
                    String repStr = sb.toString();
                    log.info("  [{}/{}] {}", fi + 1, files.length,
                            String.format(Locale.US, "%-45s | %6d ms %s | %,9d triples | %8.1f MB | %,.0f triples/s",
                                    file.getName(), result.loadingTimeMs(), repStr,
                                    result.triples(), result.memoryDeltaMb(), result.throughputTriplesPerSec()));
                } catch (java.util.concurrent.TimeoutException e) {
                    log.error("  [{}/{}] {} — LOAD TIMEOUT ({}min, engine={}, dataset={}), skipping file",
                        fi + 1, files.length, file.getName(),
                        LOAD_TIMEOUT_MINUTES, driver.getName(), datasetName);
                } catch (OutOfMemoryError e) {
                    System.gc();
                    log.error("  [{}/{}] {} — OUT OF MEMORY (engine={}, dataset={}, file={}), skipping file",
                        fi + 1, files.length, file.getName(),
                        driver.getName(), datasetName, file.getAbsolutePath(), e);
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

            // Warmup: one discarded run per query to prime the JIT and validate results.
            // Skipped in quick mode (repetitions == 1) to save time.
            if (repetitions == 1) log.info("  Quick mode — skipping query warmup");
            if (repetitions > 1) log.info("  Warming up {} queries (1 run discarded)...", queries.size());
            for (int qi = 0; repetitions > 1 && qi < queries.size(); qi++) {
                String warmupSparql = queries.get(qi).trim();
                if (warmupSparql.isEmpty()) continue;
                String warmupId = "query_" + (qi + 1);
                final String wq = warmupSparql;
                ExecutorService warmupExec = Executors.newSingleThreadExecutor(r -> {
                    Thread t = new Thread(r, "warmup-" + warmupId);
                    t.setDaemon(true);
                    return t;
                });
                Future<long[]> wf = warmupExec.submit(() -> driver.queryWithCount(wq));
                try {
                    long[] res = wf.get(queryTimeoutS, TimeUnit.SECONDS);
                    long count = res[1];
                    if (count == 0) {
                        log.warn("  {} warmup: 0 results — query may be incorrect or data not loaded", warmupId);
                    } else if (count > 0) {
                        log.debug("  {} warmup: {} result(s)", warmupId, count);
                    }
                } catch (TimeoutException e) {
                    wf.cancel(true);
                    log.warn("  {} warmup timed out after {}s — skipping", warmupId, queryTimeoutS);
                } catch (Exception e) {
                    log.warn("  {} warmup failed: {}", warmupId,
                        e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
                } finally {
                    warmupExec.shutdownNow(); // abandon stuck thread — daemon won't block JVM exit
                }
            }

            // Benchmark each query with per-execution timeout.
            // A fresh daemon-thread executor is created per query so that a stuck thread
            // (one that ignores interrupt) is abandoned rather than blocking all subsequent queries.
            for (int qi = 0; qi < queries.size(); qi++) {
                String sparql = queries.get(qi).trim();
                if (sparql.isEmpty()) continue;
                String queryId = "query_" + (qi + 1);
                String category = SparqlAnalyser.classify(sparql).name();

                long[] times      = new long[QUERY_REPS];
                long[] ttfrTimes  = new long[QUERY_REPS];
                long[] heapDeltas = new long[QUERY_REPS];

                for (int i = 0; i < QUERY_REPS; i++) {
                    final String q = sparql;
                    final int rep = i;
                    ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
                        Thread t = new Thread(r, "query-runner-" + queryId + "-rep" + rep);
                        t.setDaemon(true); // JVM won't wait for this thread on exit
                        return t;
                    });
                    Future<QueryMetrics> future = executor.submit(() -> driver.queryWithMetrics(q));
                    try {
                        QueryMetrics m = future.get(queryTimeoutS, TimeUnit.SECONDS);
                        times[i]      = m.totalMs();
                        ttfrTimes[i]  = m.ttfrMs();
                        heapDeltas[i] = m.heapDeltaBytes();
                    } catch (TimeoutException e) {
                        future.cancel(true);
                        log.warn("  {} rep {} timed out after {}s", queryId, i + 1, queryTimeoutS);
                        times[i]     = -1L;
                        ttfrTimes[i] = -1L;
                    } catch (ExecutionException e) {
                        log.warn("  {} rep {} failed: {}", queryId, i + 1, e.getCause().getMessage());
                        times[i]     = -1L;
                        ttfrTimes[i] = -1L;
                    } finally {
                        executor.shutdownNow(); // abandon stuck thread — daemon won't block JVM exit
                    }
                }
                long medianMs     = MetricsCollector.median(times);
                long medianTtfrMs = MetricsCollector.median(ttfrTimes);
                double heapDeltaMb = medianLong(heapDeltas) / (1024.0 * 1024.0);
                results.add(new QueryResult(
                    driver.getName(), datasetName, queryId,
                    category,
                    medianMs, times,
                    medianTtfrMs, ttfrTimes,
                    heapDeltaMb));
                log.info("  {} [{}] | {} ms | ttfr {} ms", queryId, category,
                    medianMs >= 0 ? medianMs : "TIMEOUT",
                    medianTtfrMs >= 0 ? medianTtfrMs : "TIMEOUT");
            }
        } finally {
            driver.close();
        }
        return results;
    }

    /** Median of raw long values (no -1 sentinel filtering — 0 is valid for heap delta). */
    private static long medianLong(long[] values) {
        if (values == null || values.length == 0) return 0L;
        long[] sorted = values.clone();
        Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    private void loadWithTimeout(String path) throws Exception {
        try (java.util.concurrent.ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "load-" + new java.io.File(path).getName());
            t.setDaemon(true);
            return t;
        })) {
            java.util.concurrent.Future<?> future = exec.submit(() -> { driver.load(path); return null; });
            try {
                future.get(LOAD_TIMEOUT_MINUTES, TimeUnit.MINUTES);
            } catch (java.util.concurrent.TimeoutException e) {
                future.cancel(true);
                exec.shutdownNow();
                throw new java.util.concurrent.TimeoutException(
                    "Load timed out after " + LOAD_TIMEOUT_MINUTES + " min: " + path);
            }
        }
    }

    private FileResult benchmarkFile(File file) throws Exception {
        String path = file.getAbsolutePath();

        // --- Warmup (discarded) — skipped in quick mode (repetitions == 1) ---
        if (repetitions > 1) {
            driver.clear();
            System.gc();
            loadWithTimeout(path);
            driver.clear();
            System.gc();
        }

        // --- 3 repetitions ---
        long[] timesMs   = new long[repetitions];
        double[] memBefore  = new double[repetitions];
        double[] memAfter   = new double[repetitions];
        double[] cpuSamples = new double[repetitions];
        long triples = 0;

        for (int i = 0; i < repetitions; i++) {
            driver.clear();
            memBefore[i] = metrics.getUsedMemoryMb();

            long start = System.nanoTime();
            loadWithTimeout(path);
            timesMs[i] = (System.nanoTime() - start) / 1_000_000L;

            cpuSamples[i] = metrics.getCpuPercent();
            memAfter[i]   = metrics.getUsedMemoryMb();
            triples       = driver.getGraphSize();
        }

        // --- Compute medians ---
        long medianTimeMs = MetricsCollector.median(timesMs);

        double[] deltas = new double[repetitions];
        for (int i = 0; i < repetitions; i++) deltas[i] = memAfter[i] - memBefore[i];

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
