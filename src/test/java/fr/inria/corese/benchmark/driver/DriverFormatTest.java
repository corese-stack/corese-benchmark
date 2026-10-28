package fr.inria.corese.benchmark.driver;

import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

class DriverFormatTest {

    private static final String NT_DATA =
            "<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .\n" +
            "<http://example.org/s2> <http://example.org/p> \"literal value\" .\n";

    private static final String TTL_DATA =
            "@prefix ex: <http://example.org/> .\n" +
            "ex:s1 ex:p ex:o1 .\n" +
            "ex:s2 ex:p \"literal value\" .\n";

    private static final String NQ_DATA =
            "<http://example.org/s1> <http://example.org/p> <http://example.org/o1> <http://example.org/g1> .\n" +
            "<http://example.org/s2> <http://example.org/p> \"literal value\" <http://example.org/g1> .\n";

    private static final String TRIG_DATA =
            "@prefix ex: <http://example.org/> .\n" +
            "ex:g1 {\n" +
            "  ex:s1 ex:p ex:o1 .\n" +
            "  ex:s2 ex:p \"literal value\" .\n" +
            "}\n";

    private static Stream<Arguments> provideDriverAndFormat() {
        return Stream.of(
            // Jena
            Arguments.of("jena", "test.nt", NT_DATA),
            Arguments.of("jena", "test.ttl", TTL_DATA),
            Arguments.of("jena", "test.nq", NQ_DATA),
            Arguments.of("jena", "test.trig", TRIG_DATA),
            // RDF4J
            Arguments.of("rdf4j", "test.nt", NT_DATA),
            Arguments.of("rdf4j", "test.ttl", TTL_DATA),
            Arguments.of("rdf4j", "test.nq", NQ_DATA),
            Arguments.of("rdf4j", "test.trig", TRIG_DATA),
            // Corese 4
            Arguments.of("corese", "test.nt", NT_DATA),
            Arguments.of("corese", "test.ttl", TTL_DATA),
            Arguments.of("corese", "test.nq", NQ_DATA),
            Arguments.of("corese", "test.trig", TRIG_DATA)
        );
    }

    private TripleStoreDriver createDriver(String engine) {
        return switch (engine) {
            case "jena" -> new JenaDriver("jena.test");
            case "rdf4j" -> new RDF4JDriver("rdf4j.test");
            case "corese" -> new CoreseDriver("corese.test", false);
            default -> throw new IllegalArgumentException("Unknown engine: " + engine);
        };
    }

    @ParameterizedTest(name = "{0} loads {1}")
    @MethodSource("provideDriverAndFormat")
    void testLoadAndQueryMultiFormat(String engine, String fileName, String content, @TempDir Path tempDir) throws Exception {
        Path file = tempDir.resolve(fileName);
        Files.writeString(file, content);

        TripleStoreDriver driver = createDriver(engine);
        driver.init();
        try {
            assertTrue(driver.supports(file), "Driver should support " + fileName);

            driver.load(file.toAbsolutePath().toString());

            assertEquals(2, driver.getGraphSize(), "Should have exactly 2 statements for " + fileName);

            // Universal query matching default and named graphs
            String sparql = "PREFIX ex: <http://example.org/> " +
                    "SELECT ?s ?p ?o WHERE { { ?s ?p ?o } UNION { GRAPH ?g { ?s ?p ?o } } }";
            long time = driver.query(sparql);
            assertTrue(time >= 0, "Query time should be non-negative");

            QueryMetrics metrics = driver.queryWithMetrics(sparql);
            assertNotNull(metrics);
            assertTrue(metrics.totalMs() >= 0);
            assertTrue(metrics.ttfrMs() >= 0);

            driver.clear();
            assertEquals(0, driver.getGraphSize(), "Should be empty after clear()");
        } finally {
            driver.close();
        }
    }
}
