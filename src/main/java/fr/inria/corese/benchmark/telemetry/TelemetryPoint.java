package fr.inria.corese.benchmark.telemetry;

/**
 * Immutable snapshot of ingestion telemetry captured at a given instant.
 *
 * @param elapsedMs     milliseconds elapsed since the start of the sampled operation
 * @param triplesLoaded number of triples loaded at the time of the sample
 * @param heapUsedMb    JVM heap used, in megabytes, rounded to one decimal place
 */
public record TelemetryPoint(long elapsedMs, long triplesLoaded, double heapUsedMb) {
}
