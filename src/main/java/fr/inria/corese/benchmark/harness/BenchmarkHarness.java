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
    private static final String STATUS_UNSTABLE = "UNSTABLE";
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

            // Phase 1: Pure Timed Query Executions (Warmup + Repetitions for all queries)
            // No cryptographic hashing or string conversions, preventing cache distortion across queries.
            List<QueryTimedRun> timedRuns = new ArrayList<>();
            boolean jvmContaminated = false;
            String leakSource = null;

            for (int qi = 0; qi < queries.size(); qi++) {
                String sparql = queries.get(qi).trim();
                if (!sparql.isEmpty()) {
                    String queryId = "query_" + (qi + 1);
                    String category = SparqlAnalyser.classify(sparql).name();

                    if (jvmContaminated) {
                        log.warn("  Skipping {} due to unrecovered thread leak in {}", queryId, leakSource);
                        timedRuns.add(buildContaminatedSkippedRun(sparql, queryId, category, leakSource));
                    } else {
                        QueryTimedRun run = measureSingleQuery(sparql, queryId, category);
                        timedRuns.add(run);

                        if (hasActiveThreadLeak(run)) {
                            jvmContaminated = true;
                            leakSource = queryId;
                            log.error("ABORTING remaining queries in JVM: thread leak detected in {}. Further queries would be contaminated.", queryId);
                        }
                    }
                }
            }

            // Phase 2: Deferred Validation Phase (Semantic Hash Fingerprinting)
            // Executed strictly after all performance-timed runs are complete.
            log.info("  Validating {} query result sets...", timedRuns.size());
            for (QueryTimedRun run : timedRuns) {
                results.add(validateAndBuildResult(run));
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
        ExecutorService warmupExec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "warmup-" + warmupId);
            t.setDaemon(true);
            return t;
        });
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
            log.warn("  {} warmup timed out after {}s — skipping", warmupId, qTimeoutS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("  {} warmup interrupted", warmupId);
        } catch (Exception e) {
            log.warn("  {} warmup failed: {}", warmupId,
                e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
        } finally {
            warmupExec.shutdownNow();
            try {
                if (!warmupExec.awaitTermination(200, TimeUnit.MILLISECONDS)) {
                    log.warn("  {} warmup worker thread still active after shutdown", warmupId);
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private record QueryTimedRun(
        String sparql,
        String queryId,
        String category,
        RepetitionBuffers buffers
    ) {}

    QueryResult benchmarkSingleQuery(String sparql, String queryId, String category) {
        return validateAndBuildResult(measureSingleQuery(sparql, queryId, category));
    }

    private QueryTimedRun measureSingleQuery(String sparql, String queryId, String category) {
        int qReps = protocol.queryRepetitions();
        double[] times       = new double[qReps];
        double[] ttfrTimes   = new double[qReps];
        long[]   heapDeltas  = new long[qReps];
        long[]   rowCounts   = new long[qReps];
        String[] statuses    = new String[qReps];
        String[] errorCauses = new String[qReps];

        RepetitionBuffers buffers = new RepetitionBuffers(times, ttfrTimes, heapDeltas, rowCounts, statuses, errorCauses);
        for (int i = 0; i < qReps; i++) {
            executeSingleRepetition(sparql, queryId, i, buffers);
            if (STATUS_TIMEOUT.equals(buffers.statuses()[i]) && buffers.errorCauses()[i] != null
                    && buffers.errorCauses()[i].contains("thread leak")) {
                // Fail-fast remaining repetitions of this query to avoid running on a contaminated engine
                for (int next = i + 1; next < qReps; next++) {
                    buffers.times()[next] = -1.0;
                    buffers.ttfrTimes()[next] = -1.0;
                    buffers.rowCounts()[next] = -1L;
                    buffers.statuses()[next] = STATUS_TIMEOUT;
                    buffers.errorCauses()[next] = "Skipped due to active thread leak in rep " + (i + 1);
                }
                break;
            }
        }
        return new QueryTimedRun(sparql, queryId, category, buffers);
    }

    private static boolean hasActiveThreadLeak(QueryTimedRun run) {
        String[] errors = run.buffers().errorCauses();
        if (errors == null) {
            return false;
        }
        for (String err : errors) {
            if (err != null && err.contains("thread leak")) {
                return true;
            }
        }
        return false;
    }

    private QueryTimedRun buildContaminatedSkippedRun(String sparql, String queryId, String category, String leakSource) {
        int qReps = protocol.queryRepetitions();
        double[] times       = new double[qReps];
        double[] ttfrTimes   = new double[qReps];
        long[]   heapDeltas  = new long[qReps];
        long[]   rowCounts   = new long[qReps];
        String[] statuses    = new String[qReps];
        String[] errorCauses = new String[qReps];

        String cause = "Skipped: contaminated JVM due to unrecovered thread leak in " + leakSource;
        for (int i = 0; i < qReps; i++) {
            times[i] = -1.0;
            ttfrTimes[i] = -1.0;
            heapDeltas[i] = 0;
            rowCounts[i] = -1L;
            statuses[i] = STATUS_ERROR;
            errorCauses[i] = cause;
        }
        RepetitionBuffers buffers = new RepetitionBuffers(times, ttfrTimes, heapDeltas, rowCounts, statuses, errorCauses);
        return new QueryTimedRun(sparql, queryId, category, buffers);
    }

    private QueryResult validateAndBuildResult(QueryTimedRun run) {
        EvaluationOutcome outcome = evaluateRepetitions(run.sparql(), run.queryId(), run.buffers());
        double heapDeltaMb = medianLong(run.buffers().heapDeltas()) / (1024.0 * 1024.0);

        log.info("  {} [{}] | {} | ttfr {} | rows {} | status {}", run.queryId(), run.category(),
            outcome.medianMs() >= 0 ? String.format(Locale.US, "%.2f ms", outcome.medianMs()) : STATUS_TIMEOUT,
            outcome.medianTtfrMs() >= 0 ? String.format(Locale.US, "%.2f ms", outcome.medianTtfrMs()) : STATUS_TIMEOUT,
            outcome.rowCount() >= 0 ? outcome.rowCount() : "-",
            outcome.status());

        return new QueryResult(
            driver.getName(), datasetName, run.queryId(),
            run.category(),
            outcome.medianMs(), run.buffers().times(),
            outcome.medianTtfrMs(), run.buffers().ttfrTimes(),
            heapDeltaMb,
            outcome.rowCount(), outcome.hash(), outcome.status(),
            run.buffers().statuses(), Arrays.asList(run.buffers().errorCauses()), outcome.hasBlankNodes()
        );
    }

    private EvaluationOutcome evaluateRepetitions(String sparql, String queryId, RepetitionBuffers buffers) {
        int qReps = buffers.statuses().length;
        int passCount = 0;
        int timeoutCount = 0;
        int errorCount = 0;
        for (String status : buffers.statuses()) {
            if (STATUS_PASS.equals(status)) passCount++;
            else if (STATUS_TIMEOUT.equals(status)) timeoutCount++;
            else errorCount++;
        }

        if (passCount == qReps) {
            return evaluateFullPass(sparql, queryId, buffers);
        }
        if (timeoutCount == qReps) {
            return new EvaluationOutcome(STATUS_TIMEOUT, -1L, "", false, -1.0, -1.0);
        }
        if (errorCount == qReps) {
            return new EvaluationOutcome(STATUS_ERROR, -1L, "", false, -1.0, -1.0);
        }
        return evaluatePartialOutcome(buffers);
    }

    private EvaluationOutcome evaluateFullPass(String sparql, String queryId, RepetitionBuffers buffers) {
        if (!areRowCountsConsistent(buffers.rowCounts())) {
            double medianMs = MetricsCollector.medianDouble(buffers.times());
            double medianTtfrMs = MetricsCollector.medianDouble(buffers.ttfrTimes());
            return new EvaluationOutcome(STATUS_UNSTABLE, -1L, "", false, medianMs, medianTtfrMs);
        }

        try {
            TripleStoreDriver.ValidationResult vr = validateWithTimeout(sparql, queryId);
            double medianMs = MetricsCollector.medianDouble(buffers.times());
            double medianTtfrMs = MetricsCollector.medianDouble(buffers.ttfrTimes());
            return new EvaluationOutcome(STATUS_PASS, buffers.rowCounts()[0], vr.hash(), vr.hasBlankNodes(), medianMs, medianTtfrMs);
        } catch (Exception e) {
            log.warn("Validation hash computation failed for {}: {}", queryId, e.getMessage());
            return new EvaluationOutcome(STATUS_ERROR, -1L, "", false, -1.0, -1.0);
        }
    }

    private TripleStoreDriver.ValidationResult validateWithTimeout(String sparql, String queryId) throws Exception {
        long qTimeoutS = Math.max(1, protocol.queryTimeoutMs() / 1000L);
        ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "validation-" + queryId);
            t.setDaemon(true);
            return t;
        });
        Future<TripleStoreDriver.ValidationResult> future = exec.submit(() -> driver.validateResult(sparql));
        try {
            return future.get(qTimeoutS, TimeUnit.SECONDS);
        } catch (TimeoutException te) {
            future.cancel(true);
            throw te;
        } finally {
            exec.shutdownNow();
            try {
                if (!exec.awaitTermination(500, TimeUnit.MILLISECONDS)) {
                    log.error("THREAD LEAK: validation worker thread for {} did not terminate within 500ms!", queryId);
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private boolean areRowCountsConsistent(long[] rowCounts) {
        for (int i = 1; i < rowCounts.length; i++) {
            if (rowCounts[i] != rowCounts[0]) {
                return false;
            }
        }
        return true;
    }

    private EvaluationOutcome evaluatePartialOutcome(RepetitionBuffers buffers) {
        double medianMs = -1.0;
        double medianTtfrMs = -1.0;
        double[] validTimes = Arrays.stream(buffers.times()).filter(t -> t >= 0).toArray();
        if (validTimes.length > 0) {
            medianMs = MetricsCollector.medianDouble(validTimes);
        }
        double[] validTtfr = Arrays.stream(buffers.ttfrTimes()).filter(t -> t >= 0).toArray();
        if (validTtfr.length > 0) {
            medianTtfrMs = MetricsCollector.medianDouble(validTtfr);
        }
        return new EvaluationOutcome(STATUS_UNSTABLE, -1L, "", false, medianMs, medianTtfrMs);
    }

    private record EvaluationOutcome(
        String status,
        long rowCount,
        String hash,
        boolean hasBlankNodes,
        double medianMs,
        double medianTtfrMs
    ) {}

    private record RepetitionBuffers(
        double[] times,
        double[] ttfrTimes,
        long[] heapDeltas,
        long[] rowCounts,
        String[] statuses,
        String[] errorCauses
    ) {
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof RepetitionBuffers b)) return false;
            return Arrays.equals(times, b.times)
                && Arrays.equals(ttfrTimes, b.ttfrTimes)
                && Arrays.equals(heapDeltas, b.heapDeltas)
                && Arrays.equals(rowCounts, b.rowCounts)
                && Arrays.equals(statuses, b.statuses)
                && Arrays.equals(errorCauses, b.errorCauses);
        }

        @Override
        public int hashCode() {
            int result = Arrays.hashCode(times);
            result = 31 * result + Arrays.hashCode(ttfrTimes);
            result = 31 * result + Arrays.hashCode(heapDeltas);
            result = 31 * result + Arrays.hashCode(rowCounts);
            result = 31 * result + Arrays.hashCode(statuses);
            result = 31 * result + Arrays.hashCode(errorCauses);
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
        ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "query-runner-" + queryId + "-rep" + rep);
            t.setDaemon(true);
            return t;
        });
        Future<QueryMetrics> future = null;
        try {
            future = executor.submit(() -> driver.queryWithMetrics(sparql));
            QueryMetrics m = future.get(qTimeoutS, TimeUnit.SECONDS);
            buffers.times()[rep]       = m.totalMs();
            buffers.ttfrTimes()[rep]   = m.ttfrMs();
            buffers.heapDeltas()[rep]  = m.heapDeltaBytes();
            buffers.rowCounts()[rep]   = m.resultCount();
            buffers.statuses()[rep]    = STATUS_PASS;
            buffers.errorCauses()[rep] = null;
        } catch (TimeoutException e) {
            if (future != null) future.cancel(true);
            executor.shutdownNow();
            handleTimeout(queryId, rep, qTimeoutS, executor, buffers);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (future != null) future.cancel(true);
            executor.shutdownNow();
            log.warn("  {} rep {} interrupted", queryId, rep + 1);
            buffers.times()[rep]       = -1.0;
            buffers.ttfrTimes()[rep]   = -1.0;
            buffers.rowCounts()[rep]   = -1L;
            buffers.statuses()[rep]    = STATUS_TIMEOUT;
            buffers.errorCauses()[rep] = "Interrupted execution";
        } catch (ExecutionException e) {
            if (future != null) future.cancel(true);
            executor.shutdownNow();
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.warn("  {} rep {} failed: {}", queryId, rep + 1, cause.getMessage());
            buffers.times()[rep]       = -1.0;
            buffers.ttfrTimes()[rep]   = -1.0;
            buffers.rowCounts()[rep]   = -1L;
            buffers.statuses()[rep]    = STATUS_ERROR;
            buffers.errorCauses()[rep] = cause.getClass().getSimpleName() + ": " + cause.getMessage();
        } finally {
            executor.shutdownNow();
        }
    }

    private void handleTimeout(
        String queryId, int rep, long qTimeoutS, ExecutorService executor, RepetitionBuffers buffers
    ) {
        boolean terminated = false;
        try {
            terminated = executor.awaitTermination(500, TimeUnit.MILLISECONDS);
            if (!terminated) {
                log.error("THREAD LEAK: worker thread for {} rep {} did not terminate within 500ms after timeout!", queryId, rep + 1);
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
        log.warn("  {} rep {} timed out after {}s", queryId, rep + 1, qTimeoutS);
        buffers.times()[rep]       = -1.0;
        buffers.ttfrTimes()[rep]   = -1.0;
        buffers.rowCounts()[rep]   = -1L;
        buffers.statuses()[rep]    = STATUS_TIMEOUT;
        buffers.errorCauses()[rep] = terminated
            ? ("Timeout after " + qTimeoutS + "s")
            : ("Uninterruptible thread leak after " + qTimeoutS + "s timeout");
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
        ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "load-" + new File(path).getName());
            t.setDaemon(true);
            return t;
        });
        Future<?> future = exec.submit(() -> {
            driver.load(path);
            return null;
        });
        try {
            future.get(protocol.loadTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new TimeoutException(
                "Load timed out after " + protocol.loadTimeoutMs() + " ms: " + path);
        } catch (InterruptedException e) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            throw e;
        } finally {
            exec.shutdownNow();
            try {
                if (!exec.awaitTermination(500, TimeUnit.MILLISECONDS)) {
                    log.warn("Load worker thread for {} still active after shutdown", path);
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
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
