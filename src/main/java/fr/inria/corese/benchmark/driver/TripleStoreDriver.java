package fr.inria.corese.benchmark.driver;

/**
 * Generic interface for all triple store benchmark drivers.
 * Each implementation wraps a specific triple store (Corese, Jena, RDF4J).
 */
public interface TripleStoreDriver {

    /** Initialize the triple store (create repository, allocate resources). */
    void init() throws Exception;

    /** Load an RDF file (N-Triples format) into the store. */
    void load(String filePath) throws Exception;

    /** Execute a SPARQL query and return execution time in milliseconds. */
    long query(String sparql) throws Exception;

    /**
     * Execute a SPARQL query and return both execution time and result row count.
     * Returns {@code long[]{timeMs, resultCount}} where {@code resultCount} is -1
     * if the driver does not support counting (e.g. non-SELECT queries).
     * Default implementation calls {@link #query(String)} and returns count -1.
     * Override to provide real counts for warmup validation.
     */
    default long[] queryWithCount(String sparql) throws Exception {
        return new long[]{ query(sparql), -1L };
    }

    /**
     * Execute a SPARQL query and return a {@link QueryMetrics} snapshot containing
     * total time, time-to-first-result (TTFR), result count, and heap delta.
     *
     * <p>Default implementation falls back to {@link #query(String)} with
     * {@code ttfrMs = totalMs} and no heap/count measurement — suitable for
     * engines that materialise results eagerly. Override to expose streaming TTFR.</p>
     *
     * @param sparql the SPARQL query string
     * @return metrics for this execution
     * @throws Exception if the driver raises an error during execution
     */
    default QueryMetrics queryWithMetrics(String sparql) throws Exception {
        long heapBefore = usedHeapBytes();
        long total = query(sparql);
        long heapDelta = usedHeapBytes() - heapBefore;
        return new QueryMetrics(total, total, -1L, heapDelta);
    }

    /** Returns current used heap in bytes without a forced GC. */
    private static long usedHeapBytes() {
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }

    /** Return the number of triples currently in the store. */
    long getGraphSize() throws Exception;

    /** Clear all triples from the store (used between repetitions). */
    void clear() throws Exception;

    /** Release all resources held by the store. */
    void close() throws Exception;

    /** Return a human-readable name for this driver (e.g. "corese.4.6.5"). */
    String getName();
}
