package fr.inria.corese.benchmark.driver;

/**
 * Snapshot of metrics collected during a single SPARQL query execution.
 *
 * @param totalMs        total wall-clock time in milliseconds (first result to last result + parse + plan)
 * @param ttfrMs         time-to-first-result in milliseconds;
 *                       equals {@code totalMs} for engines that materialise results eagerly (e.g. Corese 4.x);
 *                       {@code -1} if the query failed or produced no results before timeout
 * @param resultCount    number of result rows/triples returned; {@code -1} if not applicable or not counted
 * @param heapDeltaBytes heap memory delta in bytes (used-after minus used-before, without forced GC);
 *                       may be negative if GC ran during query execution
 */
public record QueryMetrics(long totalMs, long ttfrMs, long resultCount, long heapDeltaBytes) {}
