package fr.inria.corese.benchmark.driver;

import org.eclipse.rdf4j.repository.sail.SailRepository;
import org.eclipse.rdf4j.repository.RepositoryConnection;
import org.eclipse.rdf4j.sail.memory.MemoryStore;
import org.eclipse.rdf4j.query.TupleQuery;
import org.eclipse.rdf4j.query.TupleQueryResult;
import org.eclipse.rdf4j.query.QueryLanguage;
import org.eclipse.rdf4j.rio.RDFFormat;

import java.io.File;

public class RDF4JDriver implements TripleStoreDriver {

    private final String name;
    private SailRepository repository;

    public RDF4JDriver(String name) {
        this.name = name;
    }

    @Override
    public void init() {
        this.repository = new SailRepository(new MemoryStore());
        this.repository.init();
    }

    @Override
    public void load(String filePath) throws Exception {
        try (RepositoryConnection conn = repository.getConnection()) {
            conn.add(new File(filePath), null, RDFFormat.NTRIPLES);
        }
    }

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

    @Override
    public long getGraphSize() {
        try (RepositoryConnection conn = repository.getConnection()) {
            return conn.size();
        }
    }

    @Override
    public void clear() {
        try (RepositoryConnection conn = repository.getConnection()) {
            conn.clear();
        }
    }

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
