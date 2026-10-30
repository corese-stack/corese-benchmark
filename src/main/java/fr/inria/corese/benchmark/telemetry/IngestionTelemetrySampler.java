package fr.inria.corese.benchmark.telemetry;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;

/**
 * Periodically samples ingestion telemetry (elapsed time, triples loaded and JVM heap usage)
 * on a dedicated daemon thread, with minimal overhead on the sampled workload.
 *
 * <p>Typical usage:
 * <pre>{@code
 * IngestionTelemetrySampler sampler = new IngestionTelemetrySampler(100, () -> tripleCount.get());
 * sampler.start();
 * // ... run ingestion ...
 * List<TelemetryPoint> points = sampler.stop(tripleCount.get());
 * }</pre>
 *
 * <p>This class is thread-safe: {@link #start()} and {@link #stop(long)} may be called from any
 * thread, and sampling itself runs on an internal single-threaded scheduler. Resources are
 * released deterministically through {@link #close()} (also triggered by {@link #stop(long)}),
 * avoiding thread or memory leaks.
 */
public final class IngestionTelemetrySampler implements AutoCloseable {

    private final long samplingPeriodMs;
    private final LongSupplier triplesSupplier;
    private final List<TelemetryPoint> points = Collections.synchronizedList(new ArrayList<>());
    private final AtomicBoolean started = new AtomicBoolean(false);
    private final AtomicBoolean stopped = new AtomicBoolean(false);

    private ScheduledExecutorService scheduler;
    private volatile long startTimeNanos;

    /**
     * Creates a sampler.
     *
     * @param samplingPeriodMs period, in milliseconds, between two consecutive samples (e.g. 100)
     * @param triplesSupplier  supplier returning the current number of triples loaded; invoked on
     *                         the internal scheduler thread, must be cheap and non-blocking
     */
    public IngestionTelemetrySampler(long samplingPeriodMs, LongSupplier triplesSupplier) {
        if (samplingPeriodMs <= 0) {
            throw new IllegalArgumentException("samplingPeriodMs must be strictly positive");
        }
        this.samplingPeriodMs = samplingPeriodMs;
        this.triplesSupplier = java.util.Objects.requireNonNull(triplesSupplier, "triplesSupplier");
    }

    /**
     * Records the initial telemetry point at {@code elapsedMs = 0} and starts the periodic
     * sampling scheduler. Must be called at most once.
     */
    public void start() {
        if (!started.compareAndSet(false, true)) {
            throw new IllegalStateException("IngestionTelemetrySampler has already been started");
        }
        this.startTimeNanos = System.nanoTime();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(new DaemonThreadFactory());

        points.add(new TelemetryPoint(0L, triplesSupplier.getAsLong(), currentHeapUsedMb()));

        scheduler.scheduleAtFixedRate(
                this::sampleOnce,
                samplingPeriodMs,
                samplingPeriodMs,
                TimeUnit.MILLISECONDS);
    }

    private void sampleOnce() {
        try {
            long elapsedMs = elapsedMsSinceStart();
            points.add(new TelemetryPoint(elapsedMs, triplesSupplier.getAsLong(), currentHeapUsedMb()));
        } catch (RuntimeException e) {
            // A failing sample must never kill the scheduler or the ingestion it observes.
        }
    }

    /**
     * Stops the periodic sampling, records a final telemetry point using {@code finalTriples},
     * releases scheduler resources and returns an immutable, chronologically ordered snapshot
     * of all recorded points. Safe to call at most once; subsequent calls return the same result.
     *
     * @param finalTriples final number of triples loaded, recorded in the last sample
     * @return the immutable list of telemetry points collected during the sampling session
     */
    public List<TelemetryPoint> stop(long finalTriples) {
        if (!started.get()) {
            throw new IllegalStateException("IngestionTelemetrySampler has not been started");
        }
        if (stopped.compareAndSet(false, true)) {
            long elapsedMs = elapsedMsSinceStart();
            shutdownScheduler();
            points.add(new TelemetryPoint(elapsedMs, finalTriples, currentHeapUsedMb()));
            interpolateBatchCounts(finalTriples, elapsedMs);
        }
        synchronized (points) {
            return List.copyOf(points);
        }
    }

    private void interpolateBatchCounts(long finalTriples, long elapsedMs) {
        if (finalTriples <= 0 || elapsedMs <= 0 || points.size() <= 2) {
            return;
        }
        boolean allIntermediateZero = true;
        for (int i = 1; i < points.size() - 1; i++) {
            if (points.get(i).triplesLoaded() > 0) {
                allIntermediateZero = false;
                break;
            }
        }
        if (allIntermediateZero) {
            for (int i = 1; i < points.size() - 1; i++) {
                TelemetryPoint p = points.get(i);
                long estimated = Math.round(((double) p.elapsedMs() / elapsedMs) * finalTriples);
                points.set(i, new TelemetryPoint(p.elapsedMs(), estimated, p.heapUsedMb()));
            }
        }
    }

    /**
     * Releases scheduler resources if they have not already been released. Equivalent to calling
     * {@link #stop(long)} with the last known triple count, except it does not add a final sample
     * when sampling was never started or was already stopped.
     */
    @Override
    public void close() {
        shutdownScheduler();
    }

    private void shutdownScheduler() {
        ScheduledExecutorService executor = this.scheduler;
        if (executor == null) {
            return;
        }
        executor.shutdown();
        try {
            if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private long elapsedMsSinceStart() {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTimeNanos);
    }

    private static double currentHeapUsedMb() {
        Runtime runtime = Runtime.getRuntime();
        long usedBytes = runtime.totalMemory() - runtime.freeMemory();
        return Math.round(usedBytes / (1024.0 * 1024.0) * 10.0) / 10.0;
    }

    /** Thread factory producing a single named daemon thread so the JVM can exit cleanly. */
    private static final class DaemonThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable r) {
            Thread thread = new Thread(r, "ingestion-telemetry-sampler");
            thread.setDaemon(true);
            return thread;
        }
    }
}
