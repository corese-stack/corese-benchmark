package fr.inria.corese.benchmark.metrics;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
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
    @JsonProperty("engine") String engine,
    @JsonProperty("dataset") String dataset,
    @JsonProperty("file") String file,
    @JsonProperty("triples") long triples,

    // Loading metrics (median of repetitions)
    @JsonProperty("loadingTimeMs") long loadingTimeMs,
    @JsonProperty("throughputTriplesPerSec") double throughputTriplesPerSec,

    // Memory metrics (median delta: after - before, with forced GC)
    @JsonProperty("memoryBeforeMb") double memoryBeforeMb,
    @JsonProperty("memoryAfterMb") double memoryAfterMb,
    @JsonProperty("memoryDeltaMb") double memoryDeltaMb,

    // CPU usage during loading
    @JsonProperty("cpuPercent") double cpuPercent,

    // Raw repetition values (for transparency)
    @JsonProperty("repetitionsMs") long[] repetitionsMs,

    // Real-time telemetry samples during loading
    @JsonProperty("timeSeries") List<TelemetryPoint> timeSeries
) {
    @JsonCreator
    public FileResult(
        @JsonProperty("engine") String engine,
        @JsonProperty("dataset") String dataset,
        @JsonProperty("file") String file,
        @JsonProperty("triples") long triples,
        @JsonProperty("loadingTimeMs") long loadingTimeMs,
        @JsonProperty("throughputTriplesPerSec") double throughputTriplesPerSec,
        @JsonProperty("memoryBeforeMb") double memoryBeforeMb,
        @JsonProperty("memoryAfterMb") double memoryAfterMb,
        @JsonProperty("memoryDeltaMb") double memoryDeltaMb,
        @JsonProperty("cpuPercent") double cpuPercent,
        @JsonProperty("repetitionsMs") long[] repetitionsMs,
        @JsonProperty("timeSeries") List<TelemetryPoint> timeSeries
    ) {
        this.engine = engine;
        this.dataset = dataset;
        this.file = file;
        this.triples = triples;
        this.loadingTimeMs = loadingTimeMs;
        this.throughputTriplesPerSec = throughputTriplesPerSec;
        this.memoryBeforeMb = memoryBeforeMb;
        this.memoryAfterMb = memoryAfterMb;
        this.memoryDeltaMb = memoryDeltaMb;
        this.cpuPercent = cpuPercent;
        this.repetitionsMs = repetitionsMs != null ? repetitionsMs.clone() : new long[0];
        this.timeSeries = timeSeries != null ? List.copyOf(timeSeries) : List.of();
    }

    public FileResult(
        String engine,
        String dataset,
        String file,
        long triples,
        long loadingTimeMs,
        double throughputTriplesPerSec,
        double memoryBeforeMb,
        double memoryAfterMb,
        double memoryDeltaMb,
        double cpuPercent,
        long[] repetitionsMs
    ) {
        this(engine, dataset, file, triples, loadingTimeMs, throughputTriplesPerSec,
                memoryBeforeMb, memoryAfterMb, memoryDeltaMb, cpuPercent, repetitionsMs, List.of());
    }

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
                Arrays.equals(repetitionsMs, other.repetitionsMs) &&
                Objects.equals(timeSeries, other.timeSeries);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(engine, dataset, file, triples, loadingTimeMs,
                throughputTriplesPerSec, memoryBeforeMb, memoryAfterMb, memoryDeltaMb, cpuPercent, timeSeries);
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
                "repetitionsMs=" + Arrays.toString(repetitionsMs) + ", " +
                "timeSeries=" + (timeSeries != null ? timeSeries.size() + " points" : "none") + ']';
    }
}
