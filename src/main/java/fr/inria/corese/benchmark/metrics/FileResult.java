package fr.inria.corese.benchmark.metrics;

import java.util.Arrays;
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
) {
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FileResult other)) return false;
        return triples == other.triples &&
                loadingTimeMs == other.loadingTimeMs &&
                Double.compare(other.throughputTriplesPerSec, throughputTriplesPerSec) == 0 &&
                Double.compare(other.memoryBeforeMb, memoryBeforeMb) == 0 &&
                Double.compare(other.memoryAfterMb, memoryAfterMb) == 0 &&
                Double.compare(other.memoryDeltaMb, memoryDeltaMb) == 0 &&
                Double.compare(other.cpuPercent, cpuPercent) == 0 &&
                Objects.equals(engine, other.engine) &&
                Objects.equals(dataset, other.dataset) &&
                Objects.equals(file, other.file) &&
                Arrays.equals(repetitionsMs, other.repetitionsMs);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(engine, dataset, file, triples, loadingTimeMs,
                throughputTriplesPerSec, memoryBeforeMb, memoryAfterMb, memoryDeltaMb, cpuPercent);
        result = 31 * result + Arrays.hashCode(repetitionsMs);
        return result;
    }

    @Override
    public String toString() {
        return "FileResult[" +
                "engine=" + engine + ", " +
                "dataset=" + dataset + ", " +
                "file=" + file + ", " +
                "triples=" + triples + ", " +
                "loadingTimeMs=" + loadingTimeMs + ", " +
                "throughputTriplesPerSec=" + throughputTriplesPerSec + ", " +
                "memoryBeforeMb=" + memoryBeforeMb + ", " +
                "memoryAfterMb=" + memoryAfterMb + ", " +
                "memoryDeltaMb=" + memoryDeltaMb + ", " +
                "cpuPercent=" + cpuPercent + ", " +
                "repetitionsMs=" + Arrays.toString(repetitionsMs) + ']';
    }
}
