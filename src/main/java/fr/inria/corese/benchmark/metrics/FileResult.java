package fr.inria.corese.benchmark.metrics;

/**
 * Benchmark result for a single file loaded by a single engine.
 * All timing values are the median of 3 repetitions.
 */
public class FileResult {

    public String engine;
    public String dataset;
    public String file;
    public long triples;

    // Loading metrics (median of repetitions)
    public long loadingTimeMs;
    public double throughputTriplesPerSec;

    // Memory metrics (median delta: after - before, with forced GC)
    public double memoryBeforeMb;
    public double memoryAfterMb;
    public double memoryDeltaMb;

    // CPU usage during loading
    public double cpuPercent;

    // Raw repetition values (for transparency)
    public long[] repetitionsMs;
}
