package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.BindingTerm;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import fr.inria.corese.core.Graph;
import fr.inria.corese.core.kgram.api.core.Node;
import fr.inria.corese.core.kgram.core.Mapping;
import fr.inria.corese.core.kgram.core.Mappings;
import fr.inria.corese.core.load.Load;
import fr.inria.corese.core.api.Loader;
import fr.inria.corese.core.query.QueryProcess;
import fr.inria.corese.core.rule.RuleEngine;
import fr.inria.corese.core.sparql.api.IDatatype;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link TripleStoreDriver} implementation for Corese 4.x using the classic
 * {@code Graph} / {@code Load} / {@code QueryProcess} API.
 *
 * <p>Engine names handled: {@code corese.<version>} and {@code corese.local}.
 * For Corese 5 (new Repositories API) see {@code CoreseNextDriver}.
 */
@SuppressWarnings("unused")
public class CoreseDriver implements TripleStoreDriver {

    private final String name;
    private final boolean inference;
    private Graph graph;

    /**
     * @param name      engine label used in benchmark reports (e.g. {@code corese.4.6.5})
     * @param inference {@code true} to apply OWL-RL reasoning after loading
     */
    public CoreseDriver(String name, boolean inference) {
        this.name = name;
        this.inference = inference;
    }

    /** Creates a new empty {@link Graph}. */
    @Override
    public void init() {
        this.graph = Graph.create();
    }

    /**
     * Loads an RDF file (.nt, .nq, .ttl, .trig) into the graph and, if inference is enabled,
     * applies OWL-RL rules via {@link RuleEngine}.
     *
     * @param filePath absolute path to the RDF file
     * @throws Exception if parsing or rule processing fails
     */
    @Override
    public void load(String filePath) throws Exception {
        BenchmarkFormat format = BenchmarkFormat.fromFileName(filePath)
            .orElseThrow(() -> new IllegalArgumentException("Unsupported RDF format for file: " + filePath));
        Loader.format coreseFormat = switch (format) {
            case NTRIPLES -> Loader.format.NT_FORMAT;
            case NQUADS   -> Loader.format.NQUADS_FORMAT;
            case TURTLE   -> Loader.format.TURTLE_FORMAT;
            case TRIG     -> Loader.format.TRIG_FORMAT;
            case RDFXML   -> Loader.format.RDFXML_FORMAT;
            case JSONLD   -> Loader.format.JSONLD_FORMAT;
            case RDFA     -> Loader.format.RDFA_FORMAT;
        };
        Load loader = Load.create(graph);
        loader.parse(filePath, coreseFormat);
        applyInference();
    }

    /**
     * Executes a SPARQL query and returns the elapsed time.
     *
     * @param sparql SPARQL query string (SELECT, ASK, CONSTRUCT, DESCRIBE)
     * @return execution time in milliseconds
     * @throws Exception if the query is malformed or execution fails
     */
    @Override
    public long query(String sparql) throws Exception {
        QueryProcess exec = QueryProcess.create(graph);
        long start = System.nanoTime();
        exec.query(sparql);
        return (System.nanoTime() - start) / 1_000_000L;
    }

    /**
     * Executes a SPARQL query and returns metrics.
     * Corese 4.x {@code QueryProcess.query()} materialises all results eagerly,
     * so TTFR equals total execution time.
     * Validation hash computation is performed separately in {@link #computeResultHash(String)}
     * to eliminate cryptographic hashing distortion from latency measurements.
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) throws Exception {
        long heapBefore = MetricsCollector.usedHeapBytes();
        QueryProcess exec = QueryProcess.create(graph);
        long startNs = System.nanoTime();
        Mappings maps = exec.query(sparql);
        long totalNs = System.nanoTime() - startNs;
        long count = -1L;

        if (maps != null) {
            count = maps.getGraph() != null ? maps.getGraph().size() : maps.size();
        }

        double totalMs = totalNs / 1_000_000.0;
        return new QueryMetrics(totalMs, totalMs, count, MetricsCollector.usedHeapBytes() - heapBefore);
    }

    @Override
    public ValidationResult validateResult(String sparql) throws Exception {
        QueryProcess exec = QueryProcess.create(graph);
        Object queryResult = exec.query(sparql);
        if (queryResult instanceof Mappings maps) {
            List<String> sortedVarNames = maps.getSelect().stream()
                    .map(Node::getLabel)
                    .map(CoreseDriver::stripVariablePrefix)
                    .sorted()
                    .toList();
            SparqlResultHasher hasher = new SparqlResultHasher(sortedVarNames, SparqlResultHasher.ResultOrder.MULTISET);
            for (Mapping m : maps) {
                Map<String, BindingTerm> row = new HashMap<>();
                for (Node varNode : maps.getSelect()) {
                    String rawName = varNode.getLabel();
                    String cleanName = stripVariablePrefix(rawName);
                    Node val = m.getNode(rawName);
                    row.put(cleanName, extractCoreseBinding(val));
                }
                hasher.addTypedRow(row);
            }
            return new ValidationResult(hasher.computeHash(), hasher.hasBlankNodes());
        }
        return ValidationResult.EMPTY;
    }

    private static String stripVariablePrefix(String name) {
        if (name == null) return null;
        if (name.startsWith("?") || name.startsWith("$")) {
            return name.substring(1);
        }
        return name;
    }

    private static BindingTerm extractCoreseBinding(Node val) {
        if (val == null) {
            return BindingTerm.Unbound.INSTANCE;
        }
        if (val.isBlank()) {
            return BindingTerm.fromBlank(val.getLabel());
        }
        IDatatype dtVal = val.getDatatypeValue();
        if (dtVal != null) {
            if (dtVal.isURI()) {
                return BindingTerm.fromIri(dtVal.getLabel());
            }
            if (dtVal.isBlank()) {
                return BindingTerm.fromBlank(dtVal.getLabel());
            }
            if (dtVal.isLiteral()) {
                String lang = dtVal.getLang();
                String dt = dtVal.getDatatypeURI();
                return BindingTerm.fromLiteral(dtVal.getLabel(), lang, dt);
            }
        }
        return BindingTerm.fromLiteral(val.getLabel(), null, null);
    }

    @Override
    public String computeResultHash(String sparql) throws Exception {
        return validateResult(sparql).hash();
    }

    /** Executes a SPARQL query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) throws Exception {
        QueryProcess exec = QueryProcess.create(graph);
        long startNs = System.nanoTime();
        var maps = exec.query(sparql);
        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000L;
        return new long[]{ elapsedMs, maps instanceof Mappings m ? m.size() : -1L };
    }

    /** @return number of triples in the graph */
    @Override
    public long getGraphSize() {
        return graph.size();
    }

    /** Replaces the current graph with a new empty one, releasing all triples. */
    @Override
    public void clear() {
        this.graph = Graph.create();
    }

    /** Releases the graph reference. */
    @Override
    public void close() {
        this.graph = null;
    }

    /** @return the engine label passed at construction time */
    @Override
    public String getName() {
        return name;
    }


    private void applyInference() throws fr.inria.corese.core.sparql.exceptions.EngineException {
        if (inference) {
            RuleEngine re = RuleEngine.create(graph);
            re.setProfile(RuleEngine.OWL_RL);
            re.process();
        }
    }
}
