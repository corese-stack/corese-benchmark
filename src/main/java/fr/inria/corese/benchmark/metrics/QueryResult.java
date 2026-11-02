package fr.inria.corese.benchmark.metrics;

import java.util.Arrays;
import java.util.Objects;

/**
 * Benchmark result for a single SPARQL query executed by a single engine.
 *
 * <p>{@code medianMs} is the median of {@code QUERY_REPS} repetitions;
 * a value of {@code -1} indicates that all repetitions failed or timed out.
 * The same sentinel convention applies to {@code medianTtfrMs} and individual
 * entries in {@code repetitionsMs} / {@code repetitionsTtfrMs}.</p>
 *
 * @param engine              driver name (e.g. {@code "corese.4.6.5"})
 * @param dataset             logical dataset name (e.g. {@code "bowlogna"})
 * @param queryId             identifier of the query (e.g. {@code "query_1"})
 * @param queryCategory       structural category of the query: {@code "GRAPH_PATTERN"},
 *                            {@code "TEMPORAL"}, {@code "GROUP_BY"}, or {@code "SUBQUERY"}.
 *                            Determined by {@link SparqlAnalyser#classify(String)}.
 * @param medianMs            median total execution time in milliseconds, or {@code -1} on failure
 * @param repetitionsMs       raw per-repetition total execution times; {@code -1} entries mark failures
 * @param medianTtfrMs        median time-to-first-result in milliseconds, or {@code -1} if unavailable.
 *                            Equals {@code medianMs} for engines that evaluate queries eagerly.
 * @param repetitionsTtfrMs   raw per-repetition TTFR values; same sentinel convention as above
 * @param heapDeltaMb         median heap memory delta in MB during query execution (may be negative
 *                            if GC ran during the measurement window)
 * @param rowCount            number of result rows returned (-1 if not counted or error)
 * @param resultHash          canonical SHA-256 hash of result bindings (empty string if unavailable)
 * @param status              evaluation status ("PASS", "MISMATCH", "TIMEOUT", "ERROR")
 */
public record QueryResult(
    String engine,
    String dataset,
    String queryId,
    String queryCategory,
    long   medianMs,
    long[] repetitionsMs,
    long   medianTtfrMs,
    long[] repetitionsTtfrMs,
    double heapDeltaMb,
    long   rowCount,
    String resultHash,
    String status
) {
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof QueryResult(
                var eng, var ds, var qId, var qCat,
                var mMs, var rMs,
                var mTtfr, var rTtfr,
                var heap, var rows, var hash, var st))) return false;
        return medianMs == mMs &&
                medianTtfrMs == mTtfr &&
                rowCount == rows &&
                Double.compare(heap, heapDeltaMb) == 0 &&
                Objects.equals(engine, eng) &&
                Objects.equals(dataset, ds) &&
                Objects.equals(queryId, qId) &&
                Objects.equals(queryCategory, qCat) &&
                Objects.equals(resultHash, hash) &&
                Objects.equals(status, st) &&
                Arrays.equals(repetitionsMs, rMs) &&
                Arrays.equals(repetitionsTtfrMs, rTtfr);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(engine, dataset, queryId, queryCategory, medianMs, medianTtfrMs, heapDeltaMb, rowCount, resultHash, status);
        result = 31 * result + Arrays.hashCode(repetitionsMs);
        result = 31 * result + Arrays.hashCode(repetitionsTtfrMs);
        return result;
    }

}
