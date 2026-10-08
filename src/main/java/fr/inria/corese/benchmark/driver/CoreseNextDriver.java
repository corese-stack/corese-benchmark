package fr.inria.corese.benchmark.driver;

import fr.inria.corese.core.next.data.api.io.format.RDFFormat;
import fr.inria.corese.core.next.data.api.model.Model;
import fr.inria.corese.core.next.io.CoreseIO;
import fr.inria.corese.core.next.query.Repositories;
import fr.inria.corese.core.next.query.api.repository.Repository;
import fr.inria.corese.core.next.query.api.repository.RepositoryConnection;
import fr.inria.corese.core.next.query.api.result.GraphQueryResult;
import fr.inria.corese.core.next.query.api.result.TupleQueryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Benchmark driver for the Corese 5 API (corese-next).
 *
 * <p>Uses the new {@code Repositories} / {@code RepositoryConnection} / {@code CoreseIO}
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

    public CoreseNextDriver(String name) {
        this.name = name;
    }

    @Override
    public void init() {
        repository = Repositories.create();
        connection = repository.getConnection();
    }

    @Override
    public void load(String filePath) throws IOException {
        Path path = Path.of(filePath);
        int skipped = 0;
        try (BufferedReader br = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String line;
            while ((line = br.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                try {
                    byte[] bytes = (trimmed + "\n").getBytes(StandardCharsets.UTF_8);
                    Model model = CoreseIO.read(new ByteArrayInputStream(bytes), RDFFormat.NTRIPLES);
                    connection.add(model);
                } catch (Exception e) {
                    skipped++;
                }
            }
        }
        if (skipped > 0) {
            log.warn("corese.next: skipped {} line(s) with invalid IRIs in {}", skipped, path.getFileName());
        }
    }

    @Override
    public long query(String sparql) {
        long start = System.currentTimeMillis();
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
        return System.currentTimeMillis() - start;
    }

    @Override
    public long getGraphSize() {
        return connection.size();
    }

    @Override
    public void clear() {
        connection.clear();
    }

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

    private QueryType detectQueryType(String sparql) {
        String upper = sparql.trim().toUpperCase();
        // Strip PREFIX and BASE declarations (one per line)
        while (upper.startsWith("PREFIX") || upper.startsWith("BASE")) {
            int nl = upper.indexOf('\n');
            upper = nl >= 0 ? upper.substring(nl + 1).stripLeading() : "";
        }
        if (upper.startsWith("ASK"))       return QueryType.ASK;
        if (upper.startsWith("CONSTRUCT") || upper.startsWith("DESCRIBE")) return QueryType.GRAPH;
        return QueryType.SELECT;
    }
}
