package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.JenaDriver;
import fr.inria.corese.benchmark.driver.RDF4JDriver;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.report.BenchmarkReport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class QueryResultAccuracyTest {

    @Test
    @DisplayName("Cross-engine accuracy verification: Jena and RDF4J return identical count and hash on same dataset")
    void testCrossEngineResultAccuracy(@TempDir Path tempDir) throws Exception {
        Path ntFile = tempDir.resolve("data.nt");
        Files.writeString(ntFile,
            "<http://example.org/alice> <http://xmlns.com/foaf/0.1/name> \"Alice\" .\n" +
            "<http://example.org/bob> <http://xmlns.com/foaf/0.1/name> \"Bob\" .\n" +
            "<http://example.org/alice> <http://xmlns.com/foaf/0.1/knows> <http://example.org/bob> .\n"
        );

        String query = "SELECT ?name WHERE { ?s <http://xmlns.com/foaf/0.1/name> ?name }";
        List<String> queries = List.of(query);

        // 1. Run Jena
        JenaDriver jena = new JenaDriver("jena.test");
        BenchmarkHarness harnessJena = new BenchmarkHarness(jena, "test_accuracy", 1);
        List<QueryResult> jenaResults = harnessJena.runQueryBenchmark(tempDir.toString(), queries);

        // 2. Run RDF4J
        RDF4JDriver rdf4j = new RDF4JDriver("rdf4j.test");
        BenchmarkHarness harnessRdf4j = new BenchmarkHarness(rdf4j, "test_accuracy", 1);
        List<QueryResult> rdf4jResults = harnessRdf4j.runQueryBenchmark(tempDir.toString(), queries);

        assertEquals(1, jenaResults.size());
        assertEquals(1, rdf4jResults.size());

        QueryResult qJena = jenaResults.get(0);
        QueryResult qRdf4j = rdf4jResults.get(0);

        // Verify count matches
        assertEquals(2, qJena.rowCount(), "Jena should return 2 rows");
        assertEquals(2, qRdf4j.rowCount(), "RDF4J should return 2 rows");
        assertEquals(qJena.rowCount(), qRdf4j.rowCount());

        // Verify canonical hash matches across engines
        assertFalse(qJena.resultHash().isEmpty());
        assertFalse(qRdf4j.resultHash().isEmpty());
        assertEquals(qJena.resultHash(), qRdf4j.resultHash(), "Canonical hash must match across Jena and RDF4J");

        // Verify PASS status
        assertEquals("PASS", qJena.status());
        assertEquals("PASS", qRdf4j.status());

        // 3. Test report serialization with new fields
        Path jsonOut = tempDir.resolve("json/report.json");
        Files.createDirectories(jsonOut.getParent());
        BenchmarkReport.write(Collections.emptyList(), List.of(qJena, qRdf4j), queries, jsonOut.toString());

        String jsonContent = Files.readString(jsonOut);
        assertTrue(jsonContent.contains("\"rowCount\" : 2"));
        assertTrue(jsonContent.contains("\"resultHash\" : \"" + qJena.resultHash() + "\""));
        assertTrue(jsonContent.contains("\"status\" : \"PASS\""));

        Path csvOut = tempDir.resolve("csv/report.csv");
        assertTrue(Files.exists(csvOut));
        String csvContent = Files.readString(csvOut);
        assertTrue(csvContent.contains("rowCount,resultHash,status"));
        assertTrue(csvContent.contains(",2," + qJena.resultHash() + ",PASS,"));
    }

    @Test
    @DisplayName("Cross-validation flags MISMATCH when results or counts differ")
    void testCrossEngineMismatchDetection() {
        QueryResult q1 = new QueryResult("engineA", "ds", "q1", "PATTERN", 10, new long[]{10}, 10, new long[]{10}, 0.1, 10, "hashAAA", "PASS");
        QueryResult q2 = new QueryResult("engineB", "ds", "q1", "PATTERN", 12, new long[]{12}, 12, new long[]{12}, 0.1, 8, "hashBBB", "PASS");

        List<QueryResult> list = new java.util.ArrayList<>(List.of(q1, q2));
        // Trigger reflection or call Main via CLI / method
        try {
            java.lang.reflect.Method m = fr.inria.corese.benchmark.Main.class.getDeclaredMethod("crossValidateQueries", List.class);
            m.setAccessible(true);
            m.invoke(null, list);
            assertEquals("MISMATCH", list.get(0).status());
            assertEquals("MISMATCH", list.get(1).status());
        } catch (Exception e) {
            fail("Reflection call failed: " + e.getMessage());
        }
    }
}
