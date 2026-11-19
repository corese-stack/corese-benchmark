package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import org.eclipse.rdf4j.model.Value;
import org.eclipse.rdf4j.query.BindingSet;
import org.eclipse.rdf4j.repository.sail.SailRepository;
import org.eclipse.rdf4j.repository.RepositoryConnection;
import org.eclipse.rdf4j.sail.memory.MemoryStore;
import org.eclipse.rdf4j.query.TupleQuery;
import org.eclipse.rdf4j.query.TupleQueryResult;
import org.eclipse.rdf4j.query.QueryLanguage;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.eclipse.rdf4j.rio.RDFParser;
import org.eclipse.rdf4j.rio.Rio;
import org.eclipse.rdf4j.rio.helpers.BasicParserSettings;
import org.eclipse.rdf4j.rio.helpers.StatementCollector;
import org.eclipse.rdf4j.model.Statement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

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
     * Loads an RDF file (.nt, .nq, .ttl, .trig) into the repository.
     * For N-Triples and N-Quads, tries direct streaming first (fast path); falls back to
     * line-by-line parsing to tolerate malformed lines (e.g. invalid IRIs in DBpedia).
     * Other formats are parsed via the corresponding RIO parser.
     *
     * @param filePath absolute path to the RDF file to load
     * @throws Exception if the file cannot be opened or parsed
     */
    @Override
    public void load(String filePath) throws Exception {
        BenchmarkFormat benchFormat = BenchmarkFormat.fromFileName(filePath)
            .orElseThrow(() -> new IllegalArgumentException("Unsupported RDF format for file: " + filePath));

        RDFFormat rioFormat = switch (benchFormat) {
            case NTRIPLES -> RDFFormat.NTRIPLES;
            case NQUADS   -> RDFFormat.NQUADS;
            case TURTLE   -> RDFFormat.TURTLE;
            case TRIG     -> RDFFormat.TRIG;
        };

        if (benchFormat == BenchmarkFormat.NTRIPLES || benchFormat == BenchmarkFormat.NQUADS) {
            boolean fastPathOk = false;
            try (RepositoryConnection conn = repository.getConnection();
                 InputStream in = new BufferedInputStream(new FileInputStream(filePath))) {
                conn.begin();
                try {
                    conn.add(in, "", rioFormat);
                    conn.commit();
                    fastPathOk = true;
                } catch (Exception e) {
                    try { conn.rollback(); } catch (Exception re) { /* ignore rollback failure */ }
                    log.debug("rdf4j: direct load failed for {} ({}), switching to line-by-line", filePath, e.getMessage());
                }
            } catch (Exception outer) {
                log.debug("rdf4j: connection failed for {} ({}), switching to line-by-line", filePath, outer.getMessage());
            }
            if (!fastPathOk) {
                clear();
                loadLineByLine(filePath, rioFormat);
            }
        } else {
            // For TTL/TriG: use a lenient parser that skips invalid IRIs
            try (RepositoryConnection conn = repository.getConnection();
                 InputStream in = new BufferedInputStream(new FileInputStream(filePath))) {
                conn.begin();
                try {
                    conn.add(in, "", rioFormat);
                    conn.commit();
                } catch (Exception e) {
                    try { conn.rollback(); } catch (Exception re) { /* ignore */ }
                    log.debug("rdf4j: direct load failed for {} ({}), trying lenient parser", filePath, e.getMessage());
                    loadLenient(filePath, rioFormat);
                }
            } catch (Exception outer) {
                log.debug("rdf4j: connection failed for {} ({}), trying lenient parser", filePath, outer.getMessage());
                loadLenient(filePath, rioFormat);
            }
        }
    }

    /**
     * Lenient fallback for TTL/TriG: uses RIO parser with REPORT_PARSE_ERRORS=false
     * and VERIFY_URI_SYNTAX=false to skip invalid IRIs instead of throwing.
     */
    private void loadLenient(String filePath, RDFFormat rioFormat) throws Exception {
        StatementCollector collector = new StatementCollector();
        RDFParser parser = Rio.createParser(rioFormat);
        parser.getParserConfig().set(BasicParserSettings.VERIFY_URI_SYNTAX, false);
        parser.getParserConfig().set(BasicParserSettings.FAIL_ON_UNKNOWN_DATATYPES, false);
        parser.getParserConfig().set(BasicParserSettings.FAIL_ON_UNKNOWN_LANGUAGES, false);
        parser.setRDFHandler(collector);
        try (InputStream in = new BufferedInputStream(new FileInputStream(filePath))) {
            parser.parse(in, "");
        }
        try (RepositoryConnection conn = repository.getConnection()) {
            conn.begin();
            for (Statement st : collector.getStatements()) {
                conn.add(st);
            }
            conn.commit();
        }
        log.debug("rdf4j: lenient load completed for {}, {} statements", filePath, collector.getStatements().size());
    }

    /**
     * Fallback loader: reads the file line by line, skipping lines with invalid IRIs.
     * Used for N-Triples and N-Quads when the fast-path direct load fails.
     *
     * @param filePath  path to the RDF file
     * @param rioFormat RIO format to use for parsing each line
     */
    private void loadLineByLine(String filePath, RDFFormat rioFormat) throws Exception {
        int skipped = 0;
        try (RepositoryConnection conn = repository.getConnection();
             BufferedReader reader = new BufferedReader(
                     new InputStreamReader(new FileInputStream(filePath), StandardCharsets.UTF_8))) {
            conn.begin();
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                try {
                    conn.add(new StringReader(trimmed + "\n"), "", rioFormat);
                } catch (Exception lineEx) {
                    skipped++;
                }
            }
            conn.commit();
        }
        if (skipped > 0) {
            log.warn("rdf4j: skipped {} malformed line(s) in {}", skipped, filePath);
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
        String hash;
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                List<String> bindingNames = new ArrayList<>(result.getBindingNames());
                java.util.Collections.sort(bindingNames);
                SparqlResultHasher hasher = new SparqlResultHasher();
                if (result.hasNext()) {
                    BindingSet bs = result.next();
                    count++;
                    addRdf4jRow(hasher, bs, bindingNames);
                    ttfr = System.currentTimeMillis() - start;
                    while (result.hasNext()) {
                        bs = result.next();
                        count++;
                        addRdf4jRow(hasher, bs, bindingNames);
                    }
                } else {
                    ttfr = System.currentTimeMillis() - start;
                }
                hash = hasher.computeHash();
            }
        }
        long total = System.currentTimeMillis() - start;
        return new QueryMetrics(total, ttfr, count, MetricsCollector.usedHeapBytes() - heapBefore, hash);
    }

    private static void addRdf4jRow(SparqlResultHasher hasher, BindingSet bs, List<String> bindingNames) {
        List<String> values = new ArrayList<>(bindingNames.size());
        for (String name : bindingNames) {
            Value val = bs.getValue(name);
            values.add(val != null ? val.stringValue() : null);
        }
        hasher.addRow(values);
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
