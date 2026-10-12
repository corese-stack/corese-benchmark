package fr.inria.corese.benchmark.metrics;

/**
 * Benchmark result for a single file loaded by a single engine.
 * All timing values are the median of 3 repetitions.
 */
public record FileResult(
    String engine,
    String dataset,
    String file,
    long triples,

    // Loading metrics (median of repetitions)
    long loadingTimeMs,
    double throughputTriplesPerSec,

    // Memory metrics (median delta: after - before, with forced GC)
    double memoryBeforeMb,
    double memoryAfterMb,
    double memoryDeltaMb,

    // CPU usage during loading
    double cpuPercent,

    // Raw repetition values (for transparency)
    long[] repetitionsMs
) {}
