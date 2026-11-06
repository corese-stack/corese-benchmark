package fr.inria.corese.benchmark.metrics;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Benchmark result for a single SPARQL query executed by a single engine.
 *
 * <p>{@code medianMs} is the median of {@code QUERY_REPS} repetitions with sub-millisecond precision;
 * a value of {@code -1.0} indicates that all repetitions failed or timed out.
 * The same sentinel convention applies to {@code medianTtfrMs} and individual
 * entries in {@code repetitionsMs} / {@code repetitionsTtfrMs}.</p>
 *
 * @param engine              driver name (e.g. {@code "corese.4.6.5"})
 * @param dataset             logical dataset name (e.g. {@code "bowlogna"})
 * @param queryId             identifier of the query (e.g. {@code "query_1"})
 * @param queryCategory       structural category of the query
 * @param medianMs            median total execution time in milliseconds (fractional for sub-ms precision), or {@code -1.0} on failure
 * @param repetitionsMs       raw per-repetition total execution times in milliseconds; {@code -1.0} entries mark failures
 * @param medianTtfrMs        median time-to-first-result in milliseconds, or {@code -1.0} if unavailable
 * @param repetitionsTtfrMs   raw per-repetition TTFR values
 * @param heapDeltaMb         median heap memory delta in MB during query execution
 * @param rowCount            number of result rows returned (-1 if not counted or error)
 * @param resultHash          canonical SHA-256 hash of result bindings (empty string if unavailable)
 * @param status              evaluation status ("PASS", "UNSTABLE", "TIMEOUT", "ERROR", "MISMATCH")
 * @param repetitionsStatuses evaluation status per individual repetition
 * @param repetitionErrors    error or timeout detail per individual repetition
 * @param hasBlankNodes       true if blank nodes were encountered in the result set
 */
public record QueryResult(
    String engine,
    String dataset,
    String queryId,
    String queryCategory,
    double medianMs,
    double[] repetitionsMs,
    double medianTtfrMs,
    double[] repetitionsTtfrMs,
    double heapDeltaMb,
    long rowCount,
    String resultHash,
    String status,
    String[] repetitionsStatuses,
    List<String> repetitionErrors,
    boolean hasBlankNodes
) {
    public QueryResult {
        repetitionsMs = repetitionsMs != null ? repetitionsMs : new double[0];
        repetitionsTtfrMs = repetitionsTtfrMs != null ? repetitionsTtfrMs : new double[0];
        repetitionsStatuses = repetitionsStatuses != null ? repetitionsStatuses : new String[0];
        repetitionErrors = sanitizeErrors(repetitionErrors);
    }

    private static List<String> sanitizeErrors(List<String> errors) {
        if (errors == null) {
            return List.of();
        }
        return errors.stream()
            .map(e -> e != null ? e : "")
            .toList();
    }

    public QueryResult(
        String engine,
        String dataset,
        String queryId,
        String queryCategory,
        double medianMs,
        double[] repetitionsMs,
        double medianTtfrMs,
        double[] repetitionsTtfrMs,
        double heapDeltaMb,
        long rowCount,
        String resultHash,
        String status
    ) {
        this(engine, dataset, queryId, queryCategory, medianMs, repetitionsMs, medianTtfrMs, repetitionsTtfrMs, heapDeltaMb, rowCount, resultHash, status, new String[0], List.of(), false);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof QueryResult other)) return false;
        return Double.compare(other.medianMs, medianMs) == 0 &&
                Double.compare(other.medianTtfrMs, medianTtfrMs) == 0 &&
                rowCount == other.rowCount &&
                hasBlankNodes == other.hasBlankNodes &&
                Double.compare(other.heapDeltaMb, heapDeltaMb) == 0 &&
                Objects.equals(engine, other.engine) &&
                Objects.equals(dataset, other.dataset) &&
                Objects.equals(queryId, other.queryId) &&
                Objects.equals(queryCategory, other.queryCategory) &&
                Objects.equals(resultHash, other.resultHash) &&
                Objects.equals(status, other.status) &&
                Arrays.equals(repetitionsMs, other.repetitionsMs) &&
                Arrays.equals(repetitionsTtfrMs, other.repetitionsTtfrMs) &&
                Arrays.equals(repetitionsStatuses, other.repetitionsStatuses) &&
                Objects.equals(repetitionErrors, other.repetitionErrors);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(engine, dataset, queryId, queryCategory, medianMs, medianTtfrMs, heapDeltaMb, rowCount, resultHash, status, repetitionErrors, hasBlankNodes);
        result = 31 * result + Arrays.hashCode(repetitionsMs);
        result = 31 * result + Arrays.hashCode(repetitionsTtfrMs);
        result = 31 * result + Arrays.hashCode(repetitionsStatuses);
        return result;
    }

    @Override
    public String toString() {
        return "QueryResult[" +
                "engine=" + engine + ", " +
                "dataset=" + dataset + ", " +
                "queryId=" + queryId + ", " +
                "queryCategory=" + queryCategory + ", " +
                "medianMs=" + medianMs + ", " +
                "repetitionsMs=" + Arrays.toString(repetitionsMs) + ", " +
                "medianTtfrMs=" + medianTtfrMs + ", " +
                "repetitionsTtfrMs=" + Arrays.toString(repetitionsTtfrMs) + ", " +
                "heapDeltaMb=" + heapDeltaMb + ", " +
                "rowCount=" + rowCount + ", " +
                "resultHash=" + resultHash + ", " +
                "status=" + status + ", " +
                "repetitionsStatuses=" + Arrays.toString(repetitionsStatuses) + ", " +
                "repetitionErrors=" + repetitionErrors + ", " +
                "hasBlankNodes=" + hasBlankNodes + ']';
    }
}
