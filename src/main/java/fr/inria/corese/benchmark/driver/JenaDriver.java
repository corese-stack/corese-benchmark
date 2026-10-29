package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.RDFNode;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFDataMgr;
import org.apache.jena.system.Txn;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Benchmark driver for Apache Jena.
 *
 * <p>Stores triples and quads in a Jena in-memory transactional {@link Dataset}
 * ({@link DatasetFactory#createTxnMem()}) and executes SPARQL queries via
 * {@link QueryExecution}. All four SPARQL query forms (SELECT, CONSTRUCT, ASK,
 * DESCRIBE) are supported over default and named graphs.</p>
 */
public class JenaDriver implements TripleStoreDriver {

    private final String name;
    private Dataset dataset;

    /**
     * Constructs a new driver with the given engine name.
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "jena.6.2.0"})
     */
    public JenaDriver(String name) {
        this.name = name;
    }

    /**
     * Initialises a fresh Jena in-memory transactional dataset.
     */
    @Override
    public void init() {
        this.dataset = DatasetFactory.createTxnMem();
    }

    /**
     * Loads an RDF file (.nt, .nq, .ttl, .trig) into the Jena dataset using RIOT.
     *
     * @param filePath absolute path to the RDF file to load
     */
    @Override
    public void load(String filePath) {
        BenchmarkFormat benchFormat = BenchmarkFormat.fromFileName(filePath)
            .orElseThrow(() -> new IllegalArgumentException("Unsupported RDF format for file: " + filePath));
        Lang lang = switch (benchFormat) {
            case NTRIPLES -> Lang.NT;
            case NQUADS   -> Lang.NQ;
            case TURTLE   -> Lang.TURTLE;
            case TRIG     -> Lang.TRIG;
        };
        Txn.executeWrite(dataset, () -> RDFDataMgr.read(dataset, filePath, lang));
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
        Txn.executeRead(dataset, () -> {
            try (QueryExecution qe = QueryExecution.dataset(dataset).query(sparql).build()) {
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
        });
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
        long[] resultHolder = new long[]{-1L, -1L}; // [ttfr, count]
        String[] hashHolder = new String[]{""};

        Txn.executeRead(dataset, () -> {
            try (QueryExecution qe = QueryExecution.dataset(dataset).query(sparql).build()) {
                if (qe.getQuery().isSelectType()) {
                    ResultSet rs = qe.execSelect();
                    List<String> varNames = new ArrayList<>(rs.getResultVars());
                    Collections.sort(varNames);
                    SparqlResultHasher hasher = new SparqlResultHasher();
                    long count = 0;
                    if (rs.hasNext()) {
                        QuerySolution qs = rs.next();
                        count++;
                        addJenaRow(hasher, qs, varNames);
                        resultHolder[0] = System.currentTimeMillis() - start;
                        while (rs.hasNext()) {
                            qs = rs.next();
                            count++;
                            addJenaRow(hasher, qs, varNames);
                        }
                    } else {
                        resultHolder[0] = System.currentTimeMillis() - start;
                    }
                    resultHolder[1] = count;
                    hashHolder[0] = hasher.computeHash();
                } else if (qe.getQuery().isConstructType()) {
                    qe.execConstruct();
                    resultHolder[0] = System.currentTimeMillis() - start;
                } else if (qe.getQuery().isAskType()) {
                    qe.execAsk();
                    resultHolder[0] = System.currentTimeMillis() - start;
                } else if (qe.getQuery().isDescribeType()) {
                    qe.execDescribe();
                    resultHolder[0] = System.currentTimeMillis() - start;
                }
            }
        });

        long total = System.currentTimeMillis() - start;
        long ttfr = resultHolder[0] < 0 ? total : resultHolder[0];
        long count = resultHolder[1];
        return new QueryMetrics(total, ttfr, count, MetricsCollector.usedHeapBytes() - heapBefore, hashHolder[0]);
    }

    private static void addJenaRow(SparqlResultHasher hasher, QuerySolution qs, List<String> sortedVarNames) {
        List<String> values = new ArrayList<>(sortedVarNames.size());
        for (String var : sortedVarNames) {
            RDFNode node = qs.get(var);
            values.add(extractJenaTerm(node));
        }
        hasher.addRow(values);
    }

    private static String extractJenaTerm(RDFNode node) {
        if (node == null) return null;
        if (node.isLiteral()) {
            return node.asLiteral().getLexicalForm();
        } else if (node.isURIResource()) {
            return node.asResource().getURI();
        }
        return node.toString();
    }

    /** Executes a SPARQL SELECT query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) {
        long start = System.currentTimeMillis();
        long[] countHolder = new long[]{-1L};

        Txn.executeRead(dataset, () -> {
            try (QueryExecution qe = QueryExecution.dataset(dataset).query(sparql).build()) {
                if (qe.getQuery().isSelectType()) {
                    ResultSet rs = qe.execSelect();
                    long count = 0;
                    while (rs.hasNext()) {
                        rs.next();
                        count++;
                    }
                    countHolder[0] = count;
                } else if (qe.getQuery().isConstructType()) {
                    qe.execConstruct();
                } else if (qe.getQuery().isAskType()) {
                    qe.execAsk();
                } else if (qe.getQuery().isDescribeType()) {
                    qe.execDescribe();
                }
            }
        });

        return new long[]{ System.currentTimeMillis() - start, countHolder[0] };
    }

    /**
     * Returns the total number of statements held in the Jena dataset across
     * both the default model and all named models.
     *
     * @return statement count
     */
    @Override
    public long getGraphSize() {
        if (dataset == null) return 0L;
        return Txn.calculateRead(dataset, () -> {
            long count = dataset.getDefaultModel().size();
            var iter = dataset.listNames();
            while (iter.hasNext()) {
                count += dataset.getNamedModel(iter.next()).size();
            }
            return count;
        });
    }

    /**
     * Resets the dataset by closing it and re-creating a fresh in-memory transactional dataset.
     * A full reinit releases internal indexes instantaneously without iterating statements.
     */
    @Override
    public void clear() {
        if (dataset != null) {
            dataset.close();
            dataset = DatasetFactory.createTxnMem();
        }
    }

    /**
     * Closes and discards the Jena dataset, releasing all associated resources.
     */
    @Override
    public void close() {
        if (dataset != null) {
            dataset.close();
            this.dataset = null;
        }
    }

    @Override
    public String getName() {
        return name;
    }
}
