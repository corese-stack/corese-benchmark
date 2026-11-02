package fr.inria.corese.benchmark.metrics;

import fr.inria.corese.benchmark.telemetry.TelemetryPoint;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Benchmark result for a single file loaded by a single engine.
 * All timing and memory values are the median of 3 repetitions.
 *
 * @param engine                 driver name (e.g. {@code "corese.4.6.5"})
 * @param dataset                logical dataset name (e.g. {@code "dbpedia"})
 * @param file                   name of the {@code .nt} file (without path)
 * @param triples                number of triples loaded (from the last repetition)
 * @param loadingTimeMs          median load time across repetitions, in milliseconds
 * @param throughputTriplesPerSec median triples loaded per second
 * @param memoryBeforeMb         median JVM heap usage before loading (after forced GC), in MB
 * @param memoryAfterMb          median JVM heap usage after loading, in MB
 * @param memoryDeltaMb          median heap increase during loading ({@code after - before}), in MB
 * @param cpuPercent             median JVM CPU usage during loading (0–100)
 * @param repetitionsMs          raw per-repetition load times in milliseconds (length = 3)
 * @param timeSeries             real-time telemetry samples captured during ingestion
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
    long[] repetitionsMs,

    // Real-time telemetry samples during loading
    List<TelemetryPoint> timeSeries
) {
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FileResult(
                var eng, var ds, var f, var tri,
                var ltMs, var thpt,
                var memBef, var memAft, var memDelta,
                var cpu, var reps, var ts))) return false;
        return triples == tri &&
                loadingTimeMs == ltMs &&
                Double.compare(thpt, throughputTriplesPerSec) == 0 &&
                Double.compare(memBef, memoryBeforeMb) == 0 &&
                Double.compare(memAft, memoryAfterMb) == 0 &&
                Double.compare(memDelta, memoryDeltaMb) == 0 &&
                Double.compare(cpu, cpuPercent) == 0 &&
                Objects.equals(engine, eng) &&
                Objects.equals(dataset, ds) &&
                Objects.equals(file, f) &&
                Arrays.equals(repetitionsMs, reps) &&
                Objects.equals(timeSeries, ts);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(engine, dataset, file, triples, loadingTimeMs,
                throughputTriplesPerSec, memoryBeforeMb, memoryAfterMb, memoryDeltaMb, cpuPercent, timeSeries);
        result = 31 * result + Arrays.hashCode(repetitionsMs);
        return result;
    }

}
