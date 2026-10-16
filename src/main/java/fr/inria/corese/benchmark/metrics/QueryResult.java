package fr.inria.corese.benchmark.metrics;

/**
 * Benchmark result for a single SPARQL query executed by a single engine.
 * {@code medianMs} is the median of {@code QUERY_REPS} repetitions;
 * a value of {@code -1} indicates that the query failed or timed out.
 *
 * @param engine         driver name (e.g. {@code "corese.4.6.5"})
 * @param dataset        logical dataset name (e.g. {@code "dbpedia"})
 * @param queryId        identifier of the query (e.g. {@code "query_1"})
 * @param medianMs       median execution time in milliseconds, or {@code -1} on failure
 * @param repetitionsMs  raw per-repetition execution times in milliseconds; {@code -1} entries
 *                       indicate failed repetitions
 */
public record QueryResult(
    String engine,
    String dataset,
    String queryId,
    long medianMs,
    long[] repetitionsMs
) {}
