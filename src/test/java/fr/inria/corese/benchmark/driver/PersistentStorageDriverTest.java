package fr.inria.corese.benchmark.driver;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class PersistentStorageDriverTest {

    private static final String TURTLE_SAMPLE =
            "@prefix ex: <http://example.org/> .\n" +
            "ex:s1 ex:p ex:o1 .\n" +
            "ex:s2 ex:p \"literal value\" .\n";

    @Test
    @DisplayName("DriverFactory correctly instantiates storage variations")
    void testDriverFactoryStorageModes() {
        TripleStoreDriver jenaMem = DriverFactory.create("jena.6.2.0", false);
        assertInstanceOf(JenaDriver.class, jenaMem);
        assertFalse(((JenaDriver) jenaMem).isTdb2());

        TripleStoreDriver jenaTdb2 = DriverFactory.create("jena.6.2.0.tdb2", false);
        assertInstanceOf(JenaDriver.class, jenaTdb2);
        assertTrue(((JenaDriver) jenaTdb2).isTdb2());

        TripleStoreDriver rdf4jMem = DriverFactory.create("rdf4j.5.3.2", false);
        assertInstanceOf(RDF4JDriver.class, rdf4jMem);
        assertFalse(((RDF4JDriver) rdf4jMem).isNativeStore());

        TripleStoreDriver rdf4jNative = DriverFactory.create("rdf4j.5.3.2.native", false);
        assertInstanceOf(RDF4JDriver.class, rdf4jNative);
        assertTrue(((RDF4JDriver) rdf4jNative).isNativeStore());
    }

    @ParameterizedTest(name = "Persistent driver {0} loads, queries, clears, and closes")
    @ValueSource(strings = {"jena.test.tdb2", "rdf4j.test.native"})
    void testPersistentDriverLifecycle(String engineName, @TempDir Path tempDir) throws Exception {
        Path file = tempDir.resolve("sample.ttl");
        Files.writeString(file, TURTLE_SAMPLE);

        TripleStoreDriver driver = DriverFactory.create(engineName, false);
        // Test idempotence of init
        driver.init();
        driver.init();
        try {
            assertTrue(driver.supports(file));
            driver.load(file.toAbsolutePath().toString());

            assertEquals(2, driver.getGraphSize(), "Should contain 2 triples");

            String sparql = "PREFIX ex: <http://example.org/> SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
            long timeMs = driver.query(sparql);
            assertTrue(timeMs >= 0, "Query time should be non-negative");

            QueryMetrics metrics = driver.queryWithMetrics(sparql);
            assertNotNull(metrics);
            assertEquals(2, metrics.resultCount(), "Result count should match");
            assertTrue(metrics.totalMs() >= 0);
            assertFalse(metrics.resultHash().isBlank(), "Result hash should not be empty");

            // Test clear()
            driver.clear();
            assertEquals(0, driver.getGraphSize(), "Store should be empty after clear()");

            // Reload after clear()
            driver.load(file.toAbsolutePath().toString());
            assertEquals(2, driver.getGraphSize(), "Store should hold reloaded triples");
        } finally {
            // Test idempotence of close
            driver.close();
            driver.close();
            assertEquals(0, TempStorage.getPendingCount(), "Pending temp storage registry must be empty after close()");
        }
    }

    @Test
    @DisplayName("TempStorage respects custom corese.bench.storage.dir system property")
    void testCustomStorageBaseDirectory(@TempDir Path customBase) throws IOException {
        String original = System.getProperty(TempStorage.STORAGE_DIR_PROPERTY);
        try {
            System.setProperty(TempStorage.STORAGE_DIR_PROPERTY, customBase.toAbsolutePath().toString());
            Path created = TempStorage.create("custom-test-");
            assertTrue(created.startsWith(customBase), "Created temp dir must be inside custom storage root");
            assertTrue(Files.exists(created));

            TempStorage.release(created);
            assertFalse(Files.exists(created), "Released temp dir must be deleted");
        } finally {
            if (original != null) {
                System.setProperty(TempStorage.STORAGE_DIR_PROPERTY, original);
            } else {
                System.clearProperty(TempStorage.STORAGE_DIR_PROPERTY);
            }
        }
    }
}
