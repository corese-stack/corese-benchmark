package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.QueryMetrics;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
import fr.inria.corese.benchmark.report.BenchmarkProtocol;
import fr.inria.corese.benchmark.telemetry.IngestionTelemetrySampler;
import fr.inria.corese.benchmark.telemetry.TelemetryPoint;
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
    private static final long DEFAULT_QUERY_TIMEOUT_S  = 30; // seconds per query execution
    private static final String STATUS_PASS = "PASS";
    private static final String STATUS_TIMEOUT = "TIMEOUT";
    private static final String STATUS_ERROR = "ERROR";

    private final TripleStoreDriver driver;
    private final MetricsCollector metrics;
    private final String datasetName;
    private final BenchmarkProtocol protocol;

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName, BenchmarkProtocol protocol) {
        this.driver = driver;
        this.datasetName = datasetName;
        this.protocol = protocol != null ? protocol : BenchmarkProtocol.defaultProtocol();
        this.metrics = new MetricsCollector();
    }

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName, int repetitions) {
        this(driver, datasetName, repetitions, DEFAULT_QUERY_TIMEOUT_S);
    }

    public BenchmarkHarness(TripleStoreDriver driver, String datasetName, int repetitions, long queryTimeoutS) {
        this(driver, datasetName, BenchmarkProtocol.fromOptions(repetitions == 1, (int) queryTimeoutS));
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
                } catch (java.util.concurrent.TimeoutException e) {
                    log.error("  [{}/{}] {} — LOAD TIMEOUT ({}ms, engine={}, dataset={}), skipping file",
                        fi + 1, files.length, file.getName(),
                        protocol.loadTimeoutMs(), driver.getName(), datasetName);
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
                driver.getGraphSize(), queries.size(), protocol.queryRepetitions());

            if (protocol.warmup() > 0) {
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
            long qTimeoutS = Math.max(1, protocol.queryTimeoutMs() / 1000L);
            try {
                long[] res = wf.get(qTimeoutS, TimeUnit.SECONDS);
                long count = res[1];
                if (count == 0) {
                    log.warn("  {} warmup: 0 results — query may be incorrect or data not loaded", warmupId);
                } else if (count > 0) {
                    log.debug("  {} warmup: {} result(s)", warmupId, count);
                }
            } catch (TimeoutException e) {
                wf.cancel(true);
                warmupExec.shutdownNow();
                log.warn("  {} warmup timed out after {}s — skipping", warmupId, qTimeoutS);
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
        int qReps = protocol.queryRepetitions();
        long[] times      = new long[qReps];
        long[] ttfrTimes  = new long[qReps];
        long[] heapDeltas = new long[qReps];
        long[] rowCounts  = new long[qReps];
        String[] hashes   = new String[qReps];
        String[] statuses = new String[qReps];

        RepetitionBuffers buffers = new RepetitionBuffers(times, ttfrTimes, heapDeltas, rowCounts, hashes, statuses);
        for (int i = 0; i < qReps; i++) {
            executeSingleRepetition(sparql, queryId, i, buffers);
        }

        long medianMs     = MetricsCollector.median(times);
        long medianTtfrMs = MetricsCollector.median(ttfrTimes);
        double heapDeltaMb = medianLong(heapDeltas) / (1024.0 * 1024.0);
        long count = rowCounts[0];
        String hash = hashes[0] != null ? hashes[0] : "";
        String status;
        if (medianMs >= 0) {
            status = STATUS_PASS;
        } else if (statuses[0] != null) {
            status = statuses[0];
        } else {
            status = STATUS_ERROR;
        }

        log.info("  {} [{}] | {} ms | ttfr {} ms | rows {} | status {}", queryId, category,
            medianMs >= 0 ? medianMs : STATUS_TIMEOUT,
            medianTtfrMs >= 0 ? medianTtfrMs : STATUS_TIMEOUT,
            count >= 0 ? count : "-",
            status);

        return new QueryResult(
            driver.getName(), datasetName, queryId,
            category,
            medianMs, times,
            medianTtfrMs, ttfrTimes,
            heapDeltaMb,
            count, hash, status
        );
    }

    private record RepetitionBuffers(
        long[] times,
        long[] ttfrTimes,
        long[] heapDeltas,
        long[] rowCounts,
        String[] hashes,
        String[] statuses
    ) {
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof RepetitionBuffers b)) return false;
            return Arrays.equals(times, b.times)
                && Arrays.equals(ttfrTimes, b.ttfrTimes)
                && Arrays.equals(heapDeltas, b.heapDeltas)
                && Arrays.equals(rowCounts, b.rowCounts)
                && Arrays.equals(hashes, b.hashes)
                && Arrays.equals(statuses, b.statuses);
        }

        @Override
        public int hashCode() {
            int result = Arrays.hashCode(times);
            result = 31 * result + Arrays.hashCode(ttfrTimes);
            result = 31 * result + Arrays.hashCode(heapDeltas);
            result = 31 * result + Arrays.hashCode(rowCounts);
            result = 31 * result + Arrays.hashCode(hashes);
            result = 31 * result + Arrays.hashCode(statuses);
            return result;
        }

        @Override
        public String toString() {
            return "RepetitionBuffers";
        }
    }

    private void executeSingleRepetition(
        String sparql, String queryId, int rep, RepetitionBuffers buffers
    ) {
        long qTimeoutS = Math.max(1, protocol.queryTimeoutMs() / 1000L);
        try (ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "query-runner-" + queryId + "-rep" + rep);
            t.setDaemon(true);
            return t;
        })) {
            Future<QueryMetrics> future = executor.submit(() -> driver.queryWithMetrics(sparql));
            try {
                QueryMetrics m = future.get(qTimeoutS, TimeUnit.SECONDS);
                buffers.times()[rep]      = m.totalMs();
                buffers.ttfrTimes()[rep]  = m.ttfrMs();
                buffers.heapDeltas()[rep] = m.heapDeltaBytes();
                buffers.rowCounts()[rep]  = m.resultCount();
                buffers.hashes()[rep]     = m.resultHash();
                buffers.statuses()[rep]   = STATUS_PASS;
            } catch (TimeoutException e) {
                future.cancel(true);
                executor.shutdownNow();
                log.warn("  {} rep {} timed out after {}s", queryId, rep + 1, qTimeoutS);
                buffers.times()[rep]     = -1L;
                buffers.ttfrTimes()[rep] = -1L;
                buffers.rowCounts()[rep] = -1L;
                buffers.hashes()[rep]    = "";
                buffers.statuses()[rep]  = STATUS_TIMEOUT;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("  {} rep {} interrupted", queryId, rep + 1);
                buffers.times()[rep]     = -1L;
                buffers.ttfrTimes()[rep] = -1L;
                buffers.rowCounts()[rep] = -1L;
                buffers.hashes()[rep]    = "";
                buffers.statuses()[rep]  = STATUS_ERROR;
            } catch (ExecutionException e) {
                log.warn("  {} rep {} failed: {}", queryId, rep + 1, e.getCause().getMessage());
                buffers.times()[rep]     = -1L;
                buffers.ttfrTimes()[rep] = -1L;
                buffers.rowCounts()[rep] = -1L;
                buffers.hashes()[rep]    = "";
                buffers.statuses()[rep]  = STATUS_ERROR;
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

    private void loadWithTimeout(String path) throws InterruptedException, ExecutionException, TimeoutException {
        try (ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "load-" + new File(path).getName());
            t.setDaemon(true);
            return t;
        })) {
            Future<?> future = exec.submit(() -> {
                driver.load(path);
                return null;
            });
            try {
                future.get(protocol.loadTimeoutMs(), TimeUnit.MILLISECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                exec.shutdownNow();
                throw new TimeoutException(
                    "Load timed out after " + protocol.loadTimeoutMs() + " ms: " + path);
            } catch (InterruptedException e) {
                future.cancel(true);
                exec.shutdownNow();
                Thread.currentThread().interrupt();
                throw e;
            }
        }
    }

    @SuppressWarnings("java:S1215")
    private FileResult benchmarkFile(File file) throws Exception {
        String path = file.getAbsolutePath();

        // --- Warmup (discarded) ---
        if (protocol.warmup() > 0) {
            driver.clear();
            System.gc();
            loadWithTimeout(path);
            driver.clear();
            System.gc();
        }

        // --- Measured repetitions ---
        int reps = protocol.repetitions();
        long[] timesMs   = new long[reps];
        double[] memBefore  = new double[reps];
        double[] memAfter   = new double[reps];
        double[] cpuSamples = new double[reps];
        long triples = 0;
        List<TelemetryPoint> timeSeries = List.of();

        for (int i = 0; i < reps; i++) {
            driver.clear();
            memBefore[i] = metrics.getUsedMemoryMb();

            IngestionTelemetrySampler sampler = null;
            if (i == reps - 1) {
                // Non-intrusive heap telemetry sampling during the final repetition
                sampler = new IngestionTelemetrySampler(100, () -> 0L);
                sampler.start();
            }

            try {
                long start = System.nanoTime();
                loadWithTimeout(path);
                timesMs[i] = (System.nanoTime() - start) / 1_000_000L;

                cpuSamples[i] = metrics.getCpuPercent();
                memAfter[i]   = metrics.getUsedMemoryMb();
                triples       = driver.getGraphSize();
            } finally {
                if (sampler != null) {
                    timeSeries = sampler.stop(triples);
                }
            }
        }

        // --- Compute medians ---
        long medianTimeMs = MetricsCollector.median(timesMs);

        double[] deltas = new double[reps];
        for (int i = 0; i < reps; i++) deltas[i] = memAfter[i] - memBefore[i];

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
            timesMs,
            timeSeries
        );
    }
}
