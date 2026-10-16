package fr.inria.corese.benchmark.driver;

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
