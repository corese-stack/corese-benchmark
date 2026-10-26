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

    /** Return the number of triples currently in the store. */
    long getGraphSize() throws Exception;

    /** Clear all triples from the store (used between repetitions). */
    void clear() throws Exception;

    /** Release all resources held by the store. */
    void close() throws Exception;

    /** Return a human-readable name for this driver (e.g. "corese.4.6.5"). */
    String getName();
}
