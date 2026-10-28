package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.riot.RDFDataMgr;
import org.apache.jena.riot.Lang;

/**
 * Benchmark driver for Apache Jena 5.
 *
 * <p>Stores triples in a Jena in-memory {@link Model} and executes SPARQL queries
 * via {@link QueryExecution}. All four SPARQL query forms (SELECT, CONSTRUCT, ASK,
 * DESCRIBE) are supported.</p>
 */
public class JenaDriver implements TripleStoreDriver {

    private final String name;
    private Model model;

    /**
     * Constructs a new driver with the given engine name.
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "jena.5.2.0"})
     */
    public JenaDriver(String name) {
        this.name = name;
    }

    /**
     * Initialises a fresh Jena default (in-memory) model.
     */
    @Override
    public void init() {
        this.model = ModelFactory.createDefaultModel();
    }

    /**
     * Loads an N-Triples file into the Jena model using RIOT streaming parsing.
     *
     * @param filePath absolute path to the {@code .nt} file to load
     */
    @Override
    public void load(String filePath) {
        RDFDataMgr.read(model, filePath, Lang.NT);
    }

    /**
     * Executes a SPARQL query and fully materialises the result to ensure all
     * engine work is captured within the timed window.
     * Supports SELECT, CONSTRUCT, ASK, and DESCRIBE query forms.
     *
     * @param sparql the SPARQL query string
     * @return execution time in milliseconds
     */
    @Override
    public long query(String sparql) {
        long start = System.currentTimeMillis();
        try (QueryExecution qe = QueryExecution.model(model).query(sparql).build()) {
            if (qe.getQuery().isSelectType()) {
                ResultSet rs = qe.execSelect();
                while (rs.hasNext()) rs.next();
            } else if (qe.getQuery().isConstructType()) {
                qe.execConstruct();
            } else if (qe.getQuery().isAskType()) {
                qe.execAsk();
            } else if (qe.getQuery().isDescribeType()) {
                qe.execDescribe();
            }
        }
        return System.currentTimeMillis() - start;
    }

    /**
     * Executes a SPARQL query and returns full metrics including TTFR and heap delta.
     * For SELECT queries, TTFR is recorded after the first {@code ResultSet.next()} call.
     * For other query forms, TTFR equals total time (no streaming API).
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) {
        long heapBefore = MetricsCollector.usedHeapBytes();
        long start = System.currentTimeMillis();
        long ttfr  = -1L;
        long count = -1L;
        try (QueryExecution qe = QueryExecution.model(model).query(sparql).build()) {
            if (qe.getQuery().isSelectType()) {
                ResultSet rs = qe.execSelect();
                count = 0;
                if (rs.hasNext()) {
                    rs.next(); count++;
                    ttfr = System.currentTimeMillis() - start;
                    while (rs.hasNext()) { rs.next(); count++; }
                } else {
                    ttfr = System.currentTimeMillis() - start;
                }
            } else if (qe.getQuery().isConstructType()) {
                qe.execConstruct();
                ttfr = System.currentTimeMillis() - start;
            } else if (qe.getQuery().isAskType()) {
                qe.execAsk();
                ttfr = System.currentTimeMillis() - start;
            } else if (qe.getQuery().isDescribeType()) {
                qe.execDescribe();
                ttfr = System.currentTimeMillis() - start;
            }
        }
        long total = System.currentTimeMillis() - start;
        return new QueryMetrics(total, ttfr < 0 ? total : ttfr, count, MetricsCollector.usedHeapBytes() - heapBefore);
    }


    /** Executes a SPARQL SELECT query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) {
        long start = System.currentTimeMillis();
        long count = -1L;
        try (QueryExecution qe = QueryExecution.model(model).query(sparql).build()) {
            if (qe.getQuery().isSelectType()) {
                ResultSet rs = qe.execSelect();
                count = 0;
                while (rs.hasNext()) { rs.next(); count++; }
            } else if (qe.getQuery().isConstructType()) {
                qe.execConstruct();
            } else if (qe.getQuery().isAskType()) {
                qe.execAsk();
            } else if (qe.getQuery().isDescribeType()) {
                qe.execDescribe();
            }
        }
        return new long[]{ System.currentTimeMillis() - start, count };
    }

    /**
     * Returns the number of statements currently held in the Jena model.
     *
     * @return triple count
     */
    @Override
    public long getGraphSize() {
        return model.size();
    }

    /**
     * Removes all statements from the model.
     */
    @Override
    public void clear() {
        model.removeAll();
    }

    /**
     * Closes and discards the Jena model, releasing all associated resources.
     */
    @Override
    public void close() {
        model.close();
        this.model = null;
    }

    @Override
    public String getName() {
        return name;
    }
}
