package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import fr.inria.corese.core.next.data.api.io.format.RDFFormat;
import fr.inria.corese.core.next.data.api.term.Value;
import fr.inria.corese.core.next.query.Repositories;
import fr.inria.corese.core.next.query.api.repository.Repository;
import fr.inria.corese.core.next.query.api.repository.RepositoryConnection;
import fr.inria.corese.core.next.query.api.result.BindingSet;
import fr.inria.corese.core.next.query.api.result.GraphQueryResult;
import fr.inria.corese.core.next.query.api.result.TupleQueryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Benchmark driver for the Corese 5 API (corese-next).
 *
 * <p>Uses the new {@code Repositories} / {@code RepositoryConnection}
 * public API introduced in Corese 5. Requires the Corese 5 JAR in {@code libs/} and
 * building with {@code -PcoreseVersion=local}.</p>
 *
 * <p>Engine name convention: {@code corese.next} (or any name starting with that prefix).</p>
 */
@SuppressWarnings("unused")
public class CoreseNextDriver implements TripleStoreDriver {

    private static final Logger log = LoggerFactory.getLogger(CoreseNextDriver.class);
    private final String name;
    private Repository repository;
    private RepositoryConnection connection;

    /**
     * Constructs a new driver with the given engine name.
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "corese.next"})
     */
    public CoreseNextDriver(String name) {
        this.name = name;
    }

    /**
     * Initialises the Corese 5 in-memory repository and opens a connection.
     */
    @Override
    public void init() {
        repository = Repositories.create();
        connection = repository.getConnection();
    }

    /**
     * Loads an RDF file (.nt, .nq, .ttl, .trig) into the repository.
     *
     * @param filePath absolute path to the RDF file to load
     * @throws IOException if the file cannot be read
     */
    @Override
    public void load(String filePath) throws IOException {
        Path path = Path.of(filePath);
        BenchmarkFormat benchFormat = BenchmarkFormat.fromPath(path)
            .orElseThrow(() -> new IllegalArgumentException("Unsupported RDF format for file: " + filePath));

        RDFFormat coreseFormat = switch (benchFormat) {
            case NTRIPLES -> RDFFormat.NTRIPLES;
            case NQUADS   -> RDFFormat.NQUADS;
            case TURTLE   -> RDFFormat.TURTLE;
            case TRIG     -> RDFFormat.TRIG;
            case RDFXML   -> RDFFormat.RDFXML;
            case JSONLD   -> RDFFormat.JSONLD;
            case RDFA     -> RDFFormat.RDFA;
        };

        connection.load(path, coreseFormat);
    }

    /**
     * Executes a SPARQL query and fully iterates the result set to ensure the engine
     * has performed all work before the timer stops.
     * Supports SELECT, ASK, CONSTRUCT, and DESCRIBE query forms.
     *
     * @param sparql the SPARQL query string
     * @return execution time in milliseconds
     */
    @Override
    public long query(String sparql) {
        long startNs = System.nanoTime();
        switch (detectQueryType(sparql)) {
            case SELECT -> {
                try (TupleQueryResult result = connection.prepareTupleQuery(sparql).evaluate()) {
                    while (result.hasNext()) result.next();
                }
            }
            case ASK -> connection.prepareBooleanQuery(sparql).evaluate();
            default -> {
                try (GraphQueryResult result = connection.prepareGraphQuery(sparql).evaluate()) {
                    while (result.hasNext()) result.next();
                }
            }
        }
        return (System.nanoTime() - startNs) / 1_000_000L;
    }

    /**
     * Executes a SPARQL query and returns full metrics including TTFR and heap delta.
     * For SELECT/GRAPH queries the result is a lazy cursor — TTFR is recorded after
     * the first {@code result.next()} call. For ASK, TTFR equals total time.
     * Validation hash computation is performed separately in {@link #computeResultHash(String)}
     * to eliminate cryptographic hashing distortion from latency measurements.
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) {
        long heapBefore = MetricsCollector.usedHeapBytes();
        long startNs = System.nanoTime();
        long ttfrNs = -1L;
        long count = -1L;
        switch (detectQueryType(sparql)) {
            case SELECT -> {
                try (TupleQueryResult result = connection.prepareTupleQuery(sparql).evaluate()) {
                    count = 0;
                    if (result.hasNext()) {
                        result.next(); count++;
                        ttfrNs = System.nanoTime() - startNs;
                        while (result.hasNext()) { result.next(); count++; }
                    } else {
                        ttfrNs = System.nanoTime() - startNs;
                    }
                }
            }
            case ASK -> {
                connection.prepareBooleanQuery(sparql).evaluate();
                ttfrNs = System.nanoTime() - startNs;
            }
            default -> {
                try (GraphQueryResult result = connection.prepareGraphQuery(sparql).evaluate()) {
                    count = 0;
                    if (result.hasNext()) {
                        result.next(); count++;
                        ttfrNs = System.nanoTime() - startNs;
                        while (result.hasNext()) { result.next(); count++; }
                    } else {
                        ttfrNs = System.nanoTime() - startNs;
                    }
                }
            }
        }
        long totalNs = System.nanoTime() - startNs;
        if (ttfrNs < 0) ttfrNs = totalNs;
        double totalMs = totalNs / 1_000_000.0;
        double ttfrMs = ttfrNs / 1_000_000.0;
        return new QueryMetrics(totalMs, ttfrMs, count, MetricsCollector.usedHeapBytes() - heapBefore, "");
    }

    @Override
    public ValidationResult validateResult(String sparql) {
        switch (detectQueryType(sparql)) {
            case SELECT -> {
                return validateSelectResult(sparql);
            }
            case ASK -> {
                try {
                    boolean b = connection.prepareBooleanQuery(sparql).evaluate();
                    return new ValidationResult(new SparqlResultHasher().addRow(List.of(String.valueOf(b))).computeHash(), false);
                } catch (Exception e) {
                    log.error("Error computing CoreseNext boolean result hash: {}", e.getMessage(), e);
                    throw new IllegalStateException("CoreseNext boolean validation failed: " + e.getMessage(), e);
                }
            }
            default -> {
                return ValidationResult.EMPTY;
            }
        }
    }

    private ValidationResult validateSelectResult(String sparql) {
        try (TupleQueryResult result = connection.prepareTupleQuery(sparql).evaluate()) {
            List<String> bindingNames = new ArrayList<>(result.getBindingNames());
            Collections.sort(bindingNames);
            SparqlResultHasher hasher = new SparqlResultHasher();
            while (result.hasNext()) {
                hasher.addRow(extractBindingRow(result.next(), bindingNames));
            }
            return new ValidationResult(hasher.computeHash(), hasher.hasBlankNodes());
        } catch (Exception e) {
            log.error("Error computing CoreseNext result hash: {}", e.getMessage(), e);
            throw new IllegalStateException("CoreseNext validation failed: " + e.getMessage(), e);
        }
    }

    private static List<String> extractBindingRow(BindingSet bs, List<String> bindingNames) {
        List<String> row = new ArrayList<>(bindingNames.size());
        for (String varName : bindingNames) {
            Value val = bs.getValue(varName);
            if (val == null) {
                row.add(null);
            } else if (val.isBNode()) {
                row.add("_:" + val.stringValue());
            } else {
                row.add(val.stringValue());
            }
        }
        return row;
    }

    @Override
    public String computeResultHash(String sparql) {
        return validateResult(sparql).hash();
    }

    /** Executes a SPARQL query and returns {@code [timeMs, resultCount]} (SELECT only). */
    @Override
    public long[] queryWithCount(String sparql) {
        long startNs = System.nanoTime();
        long count = -1L;
        switch (detectQueryType(sparql)) {
            case SELECT -> {
                try (TupleQueryResult result = connection.prepareTupleQuery(sparql).evaluate()) {
                    count = 0;
                    while (result.hasNext()) { result.next(); count++; }
                }
            }
            case ASK -> connection.prepareBooleanQuery(sparql).evaluate();
            default -> {
                try (GraphQueryResult result = connection.prepareGraphQuery(sparql).evaluate()) {
                    while (result.hasNext()) result.next();
                }
            }
        }
        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000L;
        return new long[]{ elapsedMs, count };
    }

    /**
     * Returns the total number of statements currently held in the repository.
     *
     * @return triple count
     */
    @Override
    public long getGraphSize() {
        return connection.size();
    }

    /**
     * Removes all statements from the repository connection.
     */
    @Override
    public void clear() {
        connection.clear();
    }

    /**
     * Closes the repository connection and shuts down the repository, releasing
     * all resources. Safe to call even if {@link #init()} was never called.
     */
    @Override
    public void close() {
        if (connection != null) {
            connection.close();
            connection = null;
        }
        if (repository != null) {
            repository.close();
            repository = null;
        }
    }

    @Override
    public String getName() {
        return name;
    }


    private enum QueryType { SELECT, ASK, GRAPH }

    /**
     * Determines the SPARQL query form by inspecting the first keyword after any
     * PREFIX/BASE declarations.
     *
     * @param sparql the SPARQL query string
     * @return the detected {@link QueryType}
     */
    private QueryType detectQueryType(String sparql) {
        String upper = sparql.trim().toUpperCase();
        // Strip PREFIX and BASE declarations — stop if no newline to avoid infinite loop
        int safety = 0;
        while ((upper.startsWith("PREFIX") || upper.startsWith("BASE")) && safety++ < 50) {
            int nl = upper.indexOf('\n');
            if (nl < 0) break;
            upper = upper.substring(nl + 1).stripLeading();
        }
        if (upper.startsWith("ASK"))                                       return QueryType.ASK;
        if (upper.startsWith("CONSTRUCT") || upper.startsWith("DESCRIBE")) return QueryType.GRAPH;
        return QueryType.SELECT;
    }
}
