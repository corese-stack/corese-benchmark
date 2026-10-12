package fr.inria.corese.benchmark.metrics;

/**
 * Benchmark result for a single SPARQL query executed by a single engine.
 * medianMs is the median of QUERY_REPS repetitions.
 * -1 means the query failed or timed out.
 */
public record QueryResult(
    String engine,
    String dataset,
    String queryId,
    long medianMs,
    long[] repetitionsMs
) {}
