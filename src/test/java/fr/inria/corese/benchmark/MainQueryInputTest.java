package fr.inria.corese.benchmark;

import fr.inria.corese.benchmark.query.SparqlCatalogueLoader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class MainQueryInputTest {
    @TempDir Path directory;

    @Test
    void filtersRealCatalogueWithoutLosingMetadataOrMultilineText() throws Exception {
        String path = "input/queries/v1/catalogue.json";
        var all = new SparqlCatalogueLoader().load(Path.of(path));
        for (String dataset : List.of("lubm", "bsbm", "bowlogna", "dbpedia", "named-graphs")) {
            var selected = Main.loadQueries(path, dataset.toUpperCase());
            var expected = all.stream().filter(q -> q.definition().dataset().equals(dataset)).toList();
            assertFalse(expected.isEmpty());
            assertEquals(expected, selected.catalogue());
            assertEquals(expected.stream().map(SparqlCatalogueLoader.LoadedQuery::sparql).toList(), selected.queries());
        }
        assertEquals(all, Main.loadQueries(path, "dataset").catalogue());
        assertTrue(Main.loadQueries(path, "unknown").queries().isEmpty());
    }

    @Test
    void keepsLegacyLinesIncludingWhitespaceAndComments() throws Exception {
        Path file = directory.resolve("queries.txt");
        Files.writeString(file, "  SELECT * WHERE {}  \n\n \n# original comment\nASK {}\n");
        var input = Main.loadQueries(file.toString(), "lubm");
        assertNull(input.catalogue());
        assertEquals(List.of("  SELECT * WHERE {}  ", "# original comment", "ASK {}"), input.queries());
        assertTrue(Main.loadQueries(null, "lubm").queries().isEmpty());
    }

    @Test
    void standaloneRqIsOneCompleteQuery() throws Exception {
        Path file = directory.resolve("example.rq");
        String sparql = "# é\nSELECT *\nWHERE {\n ?s <urn:p>+ ?o\n}\n";
        Files.writeString(file, sparql);
        var input = Main.loadQueries(file.toString(), "lubm");
        assertEquals(List.of(sparql), input.queries());
        var definition = input.catalogue().getFirst().definition();
        assertEquals("example", definition.id());
        assertEquals("PROPERTY_PATH", definition.primaryFeature().name());
        assertEquals(30, definition.timeoutSecs());
        assertEquals("lubm", definition.dataset());
    }

    @Test
    void cliWritesFilteredCatalogueMetadataAndQueryText() throws Exception {
        Path data = Files.createDirectory(directory.resolve("data"));
        Files.writeString(data.resolve("data.nt"), "<urn:s> <urn:p> <urn:o> .");
        String sparql = "SELECT * WHERE {\n ?s ?p ?o\n}\n";
        Files.writeString(directory.resolve("query.rq"), sparql);
        Path catalogue = directory.resolve("workload.json");
        Files.writeString(catalogue, """
                {"queries":[
                  {"id":"Q01","name":"selected","file":"query.rq","dataset":"lubm",
                   "primaryFeature":"NEGATION","timeoutSecs":2},
                  {"id":"Q02","name":"excluded","file":"query.rq","dataset":"bsbm"}
                ]}
                """);
        Path output = directory.resolve("report.json");
        Main.main(new String[]{data.toString(), output.toString(), "jena.test,rdf4j.test", "lubm",
                catalogue.toString(), "--quick", "--no-isolate"});
        var report = new com.fasterxml.jackson.databind.ObjectMapper().readTree(output.toFile());
        assertEquals(2, report.path("queryRuns").size());
        for (var run : report.path("queryRuns")) {
            assertEquals("Q01", run.path("queryId").asText());
            assertEquals("NEGATION", run.path("queryCategory").asText());
            assertEquals("PASS", run.path("status").asText());
            assertEquals(1, run.path("rowCount").asLong());
        }
        assertEquals(sparql, report.path("metadata").path("queries").get(0).asText());
    }

    @Test
    void errorsDoNotFallBackToLegacyText() throws Exception {
        Path file = directory.resolve("broken.json");
        Files.writeString(file, "{}");
        assertThrows(IOException.class, () -> Main.loadQueries(file.toString(), "lubm"));
        Files.writeString(directory.resolve("empty.rq"), "  \n");
        assertThrows(IOException.class, () -> Main.loadQueries(directory.resolve("empty.rq").toString(), "lubm"));
        assertThrows(IOException.class, () -> Main.loadQueries(directory.resolve("missing.txt").toString(), "lubm"));
    }
}
