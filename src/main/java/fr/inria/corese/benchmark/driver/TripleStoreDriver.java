package fr.inria.corese.benchmark.driver;

import java.io.File;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.Set;

/**
 * Generic interface for all triple store benchmark drivers.
 * Each implementation wraps a specific triple store (Corese, Jena, RDF4J).
 */
@SuppressWarnings("java:S112") // Generic Exception declarations accommodate disparate third-party driver APIs
public interface TripleStoreDriver {

    /** Formats supported by this driver. Defaults to all BenchmarkFormats. */
    default Set<BenchmarkFormat> getSupportedFormats() {
        return EnumSet.allOf(BenchmarkFormat.class);
    }

    /** Checks whether the file is supported based on its format. */
    default boolean supports(Path path) {
        return BenchmarkFormat.fromPath(path)
                .map(f -> getSupportedFormats().contains(f))
                .orElse(false);
    }

    /** Checks whether the file is supported based on its format. */
    default boolean supports(File file) {
        return file != null && supports(file.toPath());
    }

    /** Initialize the triple store (create repository, allocate resources). */
    void init() throws Exception;

    /** Load an RDF file into the store (format detected from file extension). */
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

    /**
     * Executes an independent validation pass to compute the canonical SHA-256 hash of result bindings.
     * Executed strictly outside the performance-timed block to prevent cryptographic hashing
     * overhead from distorting query latency measurements.
     *
     * @param sparql the SPARQL query string
     * @return canonical SHA-256 hash of result bindings (empty string if unavailable or not applicable)
     * @throws Exception if validation execution fails
     */
    default String computeResultHash(String sparql) throws Exception {
        return validateResult(sparql).hash();
    }

    /**
     * Executes an independent validation pass returning both the canonical SHA-256 hash and
     * a flag indicating if blank nodes are present in the solution sequence.
     *
     * @param sparql the SPARQL query string
     * @return validation result containing canonical hash and blank node flag
     * @throws Exception if validation fails
     */
    default ValidationResult validateResult(String sparql) throws Exception {
        return ValidationResult.EMPTY;
    }

    /**
     * Validation outcome containing canonical hash and blank node detection flag.
     */
    record ValidationResult(String hash, boolean hasBlankNodes) {
        public static final ValidationResult EMPTY = new ValidationResult("", false);
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
