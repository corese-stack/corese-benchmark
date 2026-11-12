package fr.inria.corese.benchmark.telemetry;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Immutable snapshot of ingestion telemetry captured at a given instant.
 *
 * @param elapsedMs     milliseconds elapsed since the start of the sampled operation
 * @param triplesLoaded number of triples loaded at the time of the sample
 * @param heapUsedMb    JVM heap used, in megabytes, rounded to one decimal place
 */
public record TelemetryPoint(
    @JsonProperty("elapsedMs") long elapsedMs,
    @JsonProperty("triplesLoaded") long triplesLoaded,
    @JsonProperty("heapUsedMb") double heapUsedMb
) {
    @JsonCreator
    public TelemetryPoint(
        @JsonProperty("elapsedMs") long elapsedMs,
        @JsonProperty("triplesLoaded") long triplesLoaded,
        @JsonProperty("heapUsedMb") double heapUsedMb
    ) {
        this.elapsedMs = elapsedMs;
        this.triplesLoaded = triplesLoaded;
        this.heapUsedMb = heapUsedMb;
    }
}
