package fr.inria.corese.benchmark.report;

/**
 * Protocol metadata for benchmark executions.
 *
 * @param warmup           warmup repetitions count (0 in quick mode, 1 standard)
 * @param repetitions      loading repetition count
 * @param queryRepetitions query repetition count
 * @param queryTimeoutMs   timeout per query in milliseconds
 * @param loadTimeoutMs    timeout for file loading in milliseconds
 * @param metric           statistical aggregation metric (e.g. "median")
 */
public record BenchmarkProtocol(
    int warmup,
    int repetitions,
    int queryRepetitions,
    long queryTimeoutMs,
    long loadTimeoutMs,
    String metric
) {
    public static BenchmarkProtocol defaultProtocol() {
        return new BenchmarkProtocol(1, 3, 3, 30_000L, 600_000L, "median");
    }

    public static BenchmarkProtocol fromOptions(boolean quick, int queryTimeoutS) {
        int reps = quick ? 1 : 3;
        int warmup = quick ? 0 : 1;
        long queryTimeoutMs = queryTimeoutS > 0 ? queryTimeoutS * 1000L : 30_000L;
        long loadTimeoutMs = 10L * 60L * 1000L; // 10 minutes default
        return new BenchmarkProtocol(warmup, reps, reps, queryTimeoutMs, loadTimeoutMs, "median");
    }
}
