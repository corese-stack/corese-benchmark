package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.RDFNode;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFDataMgr;
import org.apache.jena.system.Txn;
import org.apache.jena.tdb2.TDB2Factory;
import org.apache.jena.tdb2.sys.TDBInternal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Benchmark driver for Apache Jena.
 *
 * <p>Supports both transactional in-memory datasets ({@link DatasetFactory#createTxnMem()})
 * and persistent disk-backed storage via Jena TDB2 ({@link TDB2Factory#connectDataset(String)}).
 * Storage mode is automatically inferred from the engine name suffix ({@code .tdb2}) or explicitly
 * configured via constructors.</p>
 *
 * <p>Thread safety note: Instances of this driver are single-threaded and operated sequentially
 * during benchmark warmup, load, and query executions.</p>
 *
 * <p>All four SPARQL query forms (SELECT, CONSTRUCT, ASK, DESCRIBE) are supported over
 * default and named graphs.</p>
 */
public class JenaDriver implements TripleStoreDriver {

    private static final Logger log = LoggerFactory.getLogger(JenaDriver.class);

    private final String name;
    private final boolean tdb2;
    private Dataset dataset;
    private Path tempDir;

    /**
     * Constructs a new driver with the given engine name.
     * TDB2 disk storage is enabled if the name ends with {@code ".tdb2"}.
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "jena.6.2.0"} or {@code "jena.6.2.0.tdb2"})
     */
    public JenaDriver(String name) {
        this(name, Objects.requireNonNull(name, "Engine name must not be null")
                .toLowerCase(Locale.ROOT).endsWith(".tdb2"));
    }

    /**
     * Constructs a new driver with explicit storage mode.
     *
     * @param name human-readable engine name
     * @param tdb2 {@code true} to use TDB2 persistent storage, {@code false} for in-memory
     */
    public JenaDriver(String name, boolean tdb2) {
        this.name = Objects.requireNonNull(name, "Engine name must not be null");
        this.tdb2 = tdb2;
    }

    /**
     * Indicates whether this driver uses TDB2 persistent disk storage.
     *
     * @return {@code true} if TDB2 is enabled, {@code false} for in-memory
     */
    public boolean isTdb2() {
        return tdb2;
    }

    /**
     * Initialises a fresh Jena dataset (in-memory transactional or disk-backed TDB2).
     * If previously initialised, releases existing resources first.
     */
    @Override
    public void init() {
        if (dataset != null || tempDir != null) {
            close();
        }
        openStorage();
    }

    private void openStorage() {
        if (tdb2) {
            try {
                this.tempDir = TempStorage.create("corese-bench-jena-tdb2-");
                this.dataset = TDB2Factory.connectDataset(tempDir.toAbsolutePath().toString());
            } catch (Exception e) {
                closeStorage();
                throw new IllegalStateException("Failed to initialise Jena TDB2 dataset", e);
            }
        } else {
            this.dataset = DatasetFactory.createTxnMem();
        }
    }

    @Override
    public Set<BenchmarkFormat> getSupportedFormats() {
        // Apache Jena RIOT does not have built-in RDFa parsing out-of-the-box
        return EnumSet.of(
            BenchmarkFormat.NTRIPLES,
            BenchmarkFormat.NQUADS,
            BenchmarkFormat.TURTLE,
            BenchmarkFormat.TRIG,
            BenchmarkFormat.RDFXML,
            BenchmarkFormat.JSONLD
        );
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
            case RDFXML   -> Lang.RDFXML;
            case JSONLD   -> Lang.JSONLD;
            case RDFA     -> throw new UnsupportedOperationException("RDFa is not natively supported by Apache Jena RIOT");
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
        long start = System.nanoTime();
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
        return (System.nanoTime() - start) / 1_000_000L;
    }

    /**
     * Executes a SPARQL query and returns full metrics including TTFR and heap delta.
     * For SELECT queries, TTFR is recorded after the first {@code ResultSet.next()} call.
     * For other query forms, TTFR equals total time (no streaming API).
     * Validation hash computation is performed separately in {@link #computeResultHash(String)}
     * to eliminate cryptographic hashing distortion from latency measurements.
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) {
        long heapBefore = MetricsCollector.usedHeapBytes();
        long startNs = System.nanoTime();
        long[] resultHolder = new long[]{-1L, -1L}; // [ttfrNs, count]

        Txn.executeRead(dataset, () -> {
            try (QueryExecution qe = QueryExecution.dataset(dataset).query(sparql).build()) {
                if (qe.getQuery().isSelectType()) {
                    ResultSet rs = qe.execSelect();
                    long count = 0;
                    if (rs.hasNext()) {
                        rs.next();
                        count++;
                        resultHolder[0] = System.nanoTime() - startNs;
                        while (rs.hasNext()) {
                            rs.next();
                            count++;
                        }
                    } else {
                        resultHolder[0] = System.nanoTime() - startNs;
                    }
                    resultHolder[1] = count;
                } else if (qe.getQuery().isConstructType()) {
                    qe.execConstruct();
                    resultHolder[0] = System.nanoTime() - startNs;
                } else if (qe.getQuery().isAskType()) {
                    qe.execAsk();
                    resultHolder[0] = System.nanoTime() - startNs;
                } else if (qe.getQuery().isDescribeType()) {
                    qe.execDescribe();
                    resultHolder[0] = System.nanoTime() - startNs;
                }
            }
        });

        long totalNs = System.nanoTime() - startNs;
        long ttfrNs = resultHolder[0] < 0 ? totalNs : resultHolder[0];
        long count = resultHolder[1];
        double totalMs = totalNs / 1_000_000.0;
        double ttfrMs = ttfrNs / 1_000_000.0;
        return new QueryMetrics(totalMs, ttfrMs, count, MetricsCollector.usedHeapBytes() - heapBefore, "");
    }

    @Override
    public ValidationResult validateResult(String sparql) {
        final ValidationResult[] holder = new ValidationResult[]{ValidationResult.EMPTY};
        Txn.executeRead(dataset, () -> {
            try (QueryExecution qe = QueryExecution.dataset(dataset).query(sparql).build()) {
                if (qe.getQuery().isSelectType()) {
                    ResultSet rs = qe.execSelect();
                    List<String> varNames = new ArrayList<>(rs.getResultVars());
                    Collections.sort(varNames);
                    SparqlResultHasher hasher = new SparqlResultHasher();
                    while (rs.hasNext()) {
                        QuerySolution qs = rs.next();
                        addJenaRow(hasher, qs, varNames);
                    }
                    holder[0] = new ValidationResult(hasher.computeHash(), hasher.hasBlankNodes());
                }
            }
        });
        return holder[0];
    }

    @Override
    public String computeResultHash(String sparql) {
        return validateResult(sparql).hash();
    }

    private static void addJenaRow(SparqlResultHasher hasher, QuerySolution qs, List<String> sortedVarNames) {
        List<String> values = new ArrayList<>(sortedVarNames.size());
        for (String varName : sortedVarNames) {
            RDFNode node = qs.get(varName);
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
        } else if (node.isAnon()) {
            return "_:" + node.asResource().getId().getLabelString();
        }
        return node.toString();
    }

    /** Executes a SPARQL query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) {
        long startNs = System.nanoTime();
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

        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000L;
        return new long[]{ elapsedMs, countHolder[0] };
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
     * Resets the dataset by closing it and re-creating a fresh dataset.
     * For in-memory, creates a new transactional memory dataset.
     * For TDB2, safely expels the dataset, deletes the temporary directory, and connects to a fresh location.
     */
    @Override
    public void clear() {
        if (dataset != null) {
            closeStorage();
            openStorage();
        }
    }

    /**
     * Closes and discards the Jena dataset, releasing all associated resources.
     * If TDB2 is enabled, expels internal locks and deletes the temporary directory.
     */
    @Override
    public void close() {
        closeStorage();
    }

    private void closeStorage() {
        try {
            if (dataset != null) {
                if (tdb2) {
                    try {
                        TDBInternal.expel(dataset.asDatasetGraph());
                    } catch (Exception e) {
                        log.warn("Error expelling Jena TDB2 dataset", e);
                    }
                }
                try {
                    dataset.close();
                } catch (Exception e) {
                    log.warn("Error closing Jena dataset", e);
                }
            }
        } finally {
            this.dataset = null;
            if (tempDir != null) {
                TempStorage.release(tempDir);
                this.tempDir = null;
            }
        }
    }

    @Override
    public String getName() {
        return name;
    }
}
