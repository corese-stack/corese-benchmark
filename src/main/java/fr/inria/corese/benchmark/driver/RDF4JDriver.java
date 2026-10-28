package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import org.eclipse.rdf4j.repository.sail.SailRepository;
import org.eclipse.rdf4j.repository.RepositoryConnection;
import org.eclipse.rdf4j.sail.memory.MemoryStore;
import org.eclipse.rdf4j.query.TupleQuery;
import org.eclipse.rdf4j.query.TupleQueryResult;
import org.eclipse.rdf4j.query.QueryLanguage;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;

/**
 * Benchmark driver for Eclipse RDF4J 5.
 *
 * <p>Stores triples in an RDF4J in-memory {@link SailRepository} backed by a
 * {@link MemoryStore}. N-Triples files are parsed in batches of 10 000 lines;
 * when a batch fails due to a malformed triple the driver falls back to
 * line-by-line parsing so that valid triples are still loaded.</p>
 */
public class RDF4JDriver implements TripleStoreDriver {

    private static final Logger log = LoggerFactory.getLogger(RDF4JDriver.class);

    private final String name;
    private SailRepository repository;

    /**
     * Constructs a new driver with the given engine name.
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "rdf4j.5.1.3"})
     */
    public RDF4JDriver(String name) {
        this.name = name;
    }

    /**
     * Initialises a fresh RDF4J in-memory {@link SailRepository}.
     */
    @Override
    public void init() {
        this.repository = new SailRepository(new MemoryStore());
        this.repository.init();
    }

    /**
     * Loads an N-Triples file into the repository using batched parsing.
     * Batches of up to 10 000 lines are submitted together; any batch that triggers
     * a parse error is retried line by line so that well-formed triples are preserved.
     * Malformed individual lines are logged as warnings and skipped.
     *
     * @param filePath absolute path to the {@code .nt} file to load
     * @throws Exception if the file cannot be opened or the transaction cannot be committed
     */
    @Override
    public void load(String filePath) throws Exception {
        // Parse in batches; on failure fall back to line-by-line to skip malformed triples.
        // The NPE from GenericStatement (null IRI) is a RuntimeException and IS catchable.
        try (RepositoryConnection conn = repository.getConnection();
             BufferedReader reader = new BufferedReader(
                     new InputStreamReader(new FileInputStream(filePath), StandardCharsets.UTF_8))) {
            conn.begin();
            StringBuilder batch = new StringBuilder();
            String line;
            int batchLineCount = 0;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                batch.append(trimmed).append('\n');
                batchLineCount++;
                if (batchLineCount >= 10_000) {
                    flushBatch(batch.toString(), conn);
                    batch.setLength(0);
                    batchLineCount = 0;
                }
            }
            if (!batch.isEmpty()) {
                flushBatch(batch.toString(), conn);
            }
            conn.commit();
        }
    }

    /**
     * Attempts to add a block of N-Triples content to the repository in one call.
     * If that fails, falls back to adding each line individually, logging a warning
     * for any line that cannot be parsed.
     *
     * @param content N-Triples text (one or more lines, newline-terminated)
     * @param conn    active repository connection; the caller manages its transaction
     */
    private void flushBatch(String content, RepositoryConnection conn) {
        try {
            conn.add(new StringReader(content), "", RDFFormat.NTRIPLES);
        } catch (Exception batchEx) {
            // Batch contains a malformed triple — fall back to line-by-line
            for (String ln : content.split("\n")) {
                if (ln.trim().isEmpty()) continue;
                try {
                    conn.add(new StringReader(ln + "\n"), "", RDFFormat.NTRIPLES);
                } catch (Exception lineEx) {
                    log.warn("Skipping malformed triple: {}", ln);
                }
            }
        }
    }

    /**
     * Executes a SPARQL SELECT query and fully iterates the result set.
     * Note: only SELECT queries are currently supported by this driver.
     *
     * @param sparql the SPARQL SELECT query string
     * @return execution time in milliseconds
     */
    @Override
    public long query(String sparql) {
        long start = System.currentTimeMillis();
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                while (result.hasNext()) result.next();
            }
        }
        return System.currentTimeMillis() - start;
    }

    /**
     * Executes a SPARQL SELECT query and returns full metrics including TTFR and heap delta.
     * RDF4J {@code TupleQueryResult} is a lazy cursor — TTFR is recorded after the first
     * {@code result.next()} call.
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) {
        long heapBefore = MetricsCollector.usedHeapBytes();
        long start = System.currentTimeMillis();
        long ttfr;
        long count = 0;
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                if (result.hasNext()) {
                    result.next(); count++;
                    ttfr = System.currentTimeMillis() - start;
                    while (result.hasNext()) { result.next(); count++; }
                } else {
                    ttfr = System.currentTimeMillis() - start;
                }
            }
        }
        long total = System.currentTimeMillis() - start;
        return new QueryMetrics(total, ttfr, count, MetricsCollector.usedHeapBytes() - heapBefore);
    }

    /** Executes a SPARQL SELECT query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) {
        long start = System.currentTimeMillis();
        long count;
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                count = 0;
                while (result.hasNext()) { result.next(); count++; }
            }
        }
        return new long[]{ System.currentTimeMillis() - start, count };
    }

    /**
     * Returns the total number of statements held in the repository.
     *
     * @return triple count
     */
    @Override
    public long getGraphSize() {
        try (RepositoryConnection conn = repository.getConnection()) {
            return conn.size();
        }
    }

    /**
     * Resets the repository by shutting it down and reinitialising a fresh
     * {@link MemoryStore}. A full reinit is used instead of a simple
     * {@code removeAll} to avoid negative memory-delta measurements caused
     * by GC residuals from the previous repetition.
     */
    @Override
    public void clear() {
        // Full reinit to release internal SAIL structures — avoids negative memory deltas
        // caused by GC collecting previous-rep residuals mid-measurement.
        if (repository != null) {
            repository.shutDown();
        }
        this.repository = new SailRepository(new MemoryStore());
        this.repository.init();
    }

    /**
     * Shuts down the repository and releases all resources.
     * Safe to call even if {@link #init()} was never called.
     */
    @Override
    public void close() {
        if (repository != null) {
            repository.shutDown();
            this.repository = null;
        }
    }

    @Override
    public String getName() {
        return name;
    }
}
