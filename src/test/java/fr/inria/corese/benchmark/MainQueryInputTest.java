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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void cliFiltersFormatsInBothProcessModes(boolean isolated) throws Exception {
        String engine = "jena." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedJenaVersion();
        Path data = Files.createDirectory(directory.resolve("formats"));
        Files.writeString(data.resolve("data.nt"), "<urn:s> <urn:p> <urn:o> .");
        Files.writeString(data.resolve("data.ttl"), "<urn:s> <urn:p> <urn:o> .");
        Path output = directory.resolve("formats.json");
        var args = new java.util.ArrayList<>(List.of(data.toString(), output.toString(), engine,
                "test", "--quick", "--mode", "load"));
        if (!isolated) args.add("--no-isolate");
        args.addAll(isolated ? List.of("--formats=ttl") : List.of("--formats", "ttl"));
        Main.main(args.toArray(String[]::new));
        var runs = new com.fasterxml.jackson.databind.ObjectMapper().readTree(output.toFile()).path("loadingRuns");
        assertEquals(1, runs.size());
        assertEquals("data.ttl", runs.get(0).path("file").asText());
    }

    @Test
    void cliAllLoadsTurtleAndQueriesCanonicalNtriples() throws Exception {
        String engine = "jena." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedJenaVersion();
        Path data = Files.createDirectory(directory.resolve("all-formats"));
        Files.writeString(data.resolve("bsbm_small.nt"), "<urn:s> <urn:p> <urn:o> .\n<urn:s2> <urn:p> <urn:o> .");
        Files.writeString(data.resolve("bsbm_small.ttl"), "<urn:s> <urn:p> <urn:o> .");
        Path query = directory.resolve("all.rq");
        Files.writeString(query, "SELECT * WHERE { ?s ?p ?o }");
        Path output = directory.resolve("all.json");
        Main.main(new String[]{data.toString(), output.toString(), engine, "bsbm", query.toString(),
                "--quick", "--no-isolate", "--mode", "all", "--formats", "ttl"});
        var report = new com.fasterxml.jackson.databind.ObjectMapper().readTree(output.toFile());
        assertEquals(1, report.path("loadingRuns").size());
        assertEquals("bsbm_small.ttl", report.path("loadingRuns").get(0).path("file").asText());
        assertEquals(1, report.path("queryRuns").size());
        assertEquals(2, report.path("queryRuns").get(0).path("rowCount").asLong());
        assertEquals("PASS", report.path("queryRuns").get(0).path("status").asText());
    }

    @Test
    void cliRejectsInvalidFormatsBeforeRunning() {
        assertThrows(IllegalArgumentException.class, () -> Main.main(new String[]{
                "missing", "unused.json", "unused", "test", "--formats", "nt,foo"}));
    }

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
        String jenaEngine = "jena." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedJenaVersion();
        String rdf4jEngine = "rdf4j." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedRdf4jVersion();
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
        Main.main(new String[]{data.toString(), output.toString(), jenaEngine + "," + rdf4jEngine, "lubm",
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
    void cliHonorsBenchmarkModeLoadOnly() throws Exception {
        String jenaEngine = "jena." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedJenaVersion();
        Path data = Files.createDirectory(directory.resolve("data-load-only"));
        Files.writeString(data.resolve("data.nt"), "<urn:s> <urn:p> <urn:o> .");
        Path catalogue = directory.resolve("workload-load.json");
        Files.writeString(catalogue, """
                {"queries":[
                  {"id":"Q01","name":"q","file":"q.rq","dataset":"lubm"}
                ]}
                """);
        Files.writeString(directory.resolve("q.rq"), "ASK {}");
        Path output = directory.resolve("report-load-only.json");
        Main.main(new String[]{data.toString(), output.toString(), jenaEngine, "lubm",
                catalogue.toString(), "--quick", "--no-isolate", "--benchmark-type", "load"});
        var report = new com.fasterxml.jackson.databind.ObjectMapper().readTree(output.toFile());
        assertTrue(report.has("loadingRuns") && !report.path("loadingRuns").isEmpty());
        assertFalse(report.has("queryRuns"));
    }

    @Test
    void cliHonorsBenchmarkModeQueryOnly() throws Exception {
        String jenaEngine = "jena." + fr.inria.corese.benchmark.driver.EngineRuntimeVerifier.getExpectedJenaVersion();
        Path data = Files.createDirectory(directory.resolve("data-query-only"));
        Files.writeString(data.resolve("lubm_small.nt"), "<urn:s> <urn:p> <urn:o> .");
        Path catalogue = directory.resolve("workload-query.json");
        Files.writeString(catalogue, """
                {"queries":[
                  {"id":"Q01","name":"q","file":"q.rq","dataset":"lubm"}
                ]}
                """);
        Files.writeString(directory.resolve("q.rq"), "ASK {}");
        Path output = directory.resolve("report-query-only.json");
        Main.main(new String[]{data.toString(), output.toString(), jenaEngine, "lubm",
                catalogue.toString(), "--quick", "--no-isolate", "--mode", "query"});
        var report = new com.fasterxml.jackson.databind.ObjectMapper().readTree(output.toFile());
        assertTrue(report.path("loadingRuns").isEmpty());
        assertTrue(report.has("queryRuns") && !report.path("queryRuns").isEmpty());
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
