package fr.inria.corese.benchmark.driver;

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

public class RDF4JDriver implements TripleStoreDriver {

    private static final Logger log = LoggerFactory.getLogger(RDF4JDriver.class);

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
        // Full reinit to release internal SAIL structures — avoids negative memory deltas
        // caused by GC collecting previous-rep residuals mid-measurement.
        if (repository != null) {
            repository.shutDown();
        }
        this.repository = new SailRepository(new MemoryStore());
        this.repository.init();
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
