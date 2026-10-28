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
import java.util.stream.Collectors;

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
    private static final long DEFAULT_QUERY_TIMEOUT_S = 30; // seconds per query execution
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
     * Runs the load benchmark over all supported RDF files (.nt, .nq, .ttl, .trig)
     * found in {@code datasetDir}. Files are sorted alphabetically.
     * For each file the harness performs one warmup load followed by REPETITIONS
     * measured repetitions, keeping the median.
     * The driver is initialised at the start and closed in a {@code finally} block.
     *
     * @param datasetDir path to the directory containing RDF files
     * @return one {@link FileResult} per file, in sorted file order
     * @throws IllegalArgumentException if no supported files are found
     * @throws Exception                if the driver or file I/O raises an error
     */
    @SuppressWarnings("java:S1215")
    public List<FileResult> run(String datasetDir) throws Exception {
        File[] files = discoverFiles(datasetDir);

        List<FileResult> results = new ArrayList<>();
        driver.init();
        try {
            log.info("=== Benchmark: {} | Dataset: {} | {} file(s) ===", driver.getName(), datasetName, files.length);
            for (int fi = 0; fi < files.length; fi++) {
                File file = files[fi];
                try {
                    FileResult result = benchmarkFile(file);
                    results.add(result);
                    String repStr = Arrays.stream(result.repetitionsMs())
                            .mapToObj(String::valueOf)
                            .collect(Collectors.joining(", ", "[", "]"));
                    log.info("  [{}/{}] {}", fi + 1, files.length,
                            String.format(Locale.US, "%-45s | %6d ms %s | %,9d triples | %8.1f MB | %,.0f triples/s",
                                    file.getName(), result.loadingTimeMs(), repStr,
                                    result.triples(), result.memoryDeltaMb(), result.throughputTriplesPerSec()));
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
        File[] files = discoverFiles(datasetDir);

        List<QueryResult> results = new ArrayList<>();
        driver.init();
        try {
            log.info("=== Query Benchmark: {} | Dataset: {} ===", driver.getName(), datasetName);
            log.info("  Loading {} file(s)...", files.length);
            for (File file : files) {
                driver.load(file.getAbsolutePath());
            }
            log.info("  {} triples loaded — running {} queries × {} reps",
                driver.getGraphSize(), queries.size(), QUERY_REPS);

            if (repetitions > 1) {
                warmupQueries(queries);
            } else {
                log.info("  Quick mode — skipping query warmup");
            }

            for (int qi = 0; qi < queries.size(); qi++) {
                String sparql = queries.get(qi).trim();
                if (sparql.isEmpty()) continue;
                String queryId = "query_" + (qi + 1);
                String category = SparqlAnalyser.classify(sparql).name();
                results.add(benchmarkSingleQuery(sparql, queryId, category));
            }
        } finally {
            driver.close();
        }
        return results;
    }

    private void warmupQueries(List<String> queries) {
        log.info("  Warming up {} queries (1 run discarded)...", queries.size());
        for (int qi = 0; qi < queries.size(); qi++) {
            String warmupSparql = queries.get(qi).trim();
            if (warmupSparql.isEmpty()) continue;
            String warmupId = "query_" + (qi + 1);
            runSingleWarmup(warmupSparql, warmupId);
        }
    }

    private void runSingleWarmup(String warmupSparql, String warmupId) {
        try (ExecutorService warmupExec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "warmup-" + warmupId);
            t.setDaemon(true);
            return t;
        })) {
            Future<long[]> wf = warmupExec.submit(() -> driver.queryWithCount(warmupSparql));
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
                warmupExec.shutdownNow();
                log.warn("  {} warmup timed out after {}s — skipping", warmupId, queryTimeoutS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("  {} warmup interrupted", warmupId);
            } catch (Exception e) {
                log.warn("  {} warmup failed: {}", warmupId,
                    e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
            }
        }
    }

    private QueryResult benchmarkSingleQuery(String sparql, String queryId, String category) {
        long[] times      = new long[QUERY_REPS];
        long[] ttfrTimes  = new long[QUERY_REPS];
        long[] heapDeltas = new long[QUERY_REPS];

        for (int i = 0; i < QUERY_REPS; i++) {
            executeSingleRepetition(sparql, queryId, i, times, ttfrTimes, heapDeltas);
        }

        long medianMs     = MetricsCollector.median(times);
        long medianTtfrMs = MetricsCollector.median(ttfrTimes);
        double heapDeltaMb = medianLong(heapDeltas) / (1024.0 * 1024.0);

        log.info("  {} [{}] | {} ms | ttfr {} ms", queryId, category,
            medianMs >= 0 ? medianMs : "TIMEOUT",
            medianTtfrMs >= 0 ? medianTtfrMs : "TIMEOUT");

        return new QueryResult(
            driver.getName(), datasetName, queryId,
            category,
            medianMs, times,
            medianTtfrMs, ttfrTimes,
            heapDeltaMb
        );
    }

    private void executeSingleRepetition(
        String sparql, String queryId, int rep,
        long[] times, long[] ttfrTimes, long[] heapDeltas
    ) {
        try (ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "query-runner-" + queryId + "-rep" + rep);
            t.setDaemon(true);
            return t;
        })) {
            Future<QueryMetrics> future = executor.submit(() -> driver.queryWithMetrics(sparql));
            try {
                QueryMetrics m = future.get(queryTimeoutS, TimeUnit.SECONDS);
                times[rep]      = m.totalMs();
                ttfrTimes[rep]  = m.ttfrMs();
                heapDeltas[rep] = m.heapDeltaBytes();
            } catch (TimeoutException e) {
                future.cancel(true);
                executor.shutdownNow();
                log.warn("  {} rep {} timed out after {}s", queryId, rep + 1, queryTimeoutS);
                times[rep]     = -1L;
                ttfrTimes[rep] = -1L;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("  {} rep {} interrupted", queryId, rep + 1);
                times[rep]     = -1L;
                ttfrTimes[rep] = -1L;
            } catch (ExecutionException e) {
                log.warn("  {} rep {} failed: {}", queryId, rep + 1, e.getCause().getMessage());
                times[rep]     = -1L;
                ttfrTimes[rep] = -1L;
            }
        }
    }

    /**
     * Discovers all regular RDF files in {@code datasetDir} supported by the current driver,
     * sorted alphabetically for reproducibility.
     */
    private File[] discoverFiles(String datasetDir) {
        File dir = new File(datasetDir);
        if (!dir.exists() || !dir.isDirectory()) {
            throw new IllegalArgumentException("Dataset directory does not exist or is not a directory: " + datasetDir);
        }
        File[] files = dir.listFiles(f -> f.isFile() && driver.supports(f));
        if (files == null || files.length == 0) {
            throw new IllegalArgumentException(String.format(
                "No supported RDF files (%s) found in: %s for driver %s",
                driver.getSupportedFormats(), datasetDir, driver.getName()
            ));
        }
        Arrays.sort(files);
        return files;
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

    @SuppressWarnings("java:S1215")
    private FileResult benchmarkFile(File file) throws Exception {
        String path = file.getAbsolutePath();

        // --- Warmup (discarded) — skipped in quick mode (repetitions == 1) ---
        if (repetitions > 1) {
            driver.clear();
            System.gc();
            driver.load(path);
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
            driver.load(path);
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
