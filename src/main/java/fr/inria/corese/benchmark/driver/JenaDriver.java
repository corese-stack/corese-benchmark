package fr.inria.corese.benchmark.driver;

import org.apache.jena.query.*;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.riot.RDFDataMgr;
import org.apache.jena.riot.Lang;

public class JenaDriver implements TripleStoreDriver {

    private final String name;
    private Model model;

    public JenaDriver(String name) {
        this.name = name;
    }

    @Override
    public void init() {
        this.model = ModelFactory.createDefaultModel();
    }

    @Override
    public void load(String filePath) {
        RDFDataMgr.read(model, filePath, Lang.NT);
    }

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

    @Override
    public long getGraphSize() {
        return model.size();
    }

    @Override
    public void clear() {
        model.removeAll();
    }

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
