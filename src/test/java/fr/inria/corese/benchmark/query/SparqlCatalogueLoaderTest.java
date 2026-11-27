package fr.inria.corese.benchmark.query;

import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import java.io.IOException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class SparqlCatalogueLoaderTest {
    @TempDir
    Path directory;
    private final SparqlCatalogueLoader loader = new SparqlCatalogueLoader();

    @Test
    void loadsRealCatalogueWithoutChangingTextOrMetadata() throws Exception {
        Path catalogue = Path.of("input/queries/v1/catalogue.json");
        var queries = loader.load(catalogue);
        assertEquals(15, queries.size());
        assertEquals("Q01", queries.getFirst().definition().id());
        assertEquals("Q15", queries.getLast().definition().id());
        assertThrows(UnsupportedOperationException.class, queries::clear);
        for (var query : queries) {
            var definition = query.definition();
            assertEquals(Files.readString(catalogue.getParent().resolve(definition.file())), query.sparql());
            assertEquals(definition.primaryFeature(), SparqlAnalyser.classifyFeature(query.sparql()), definition.id());
        }
        assertEquals("ordered_exact", queries.get(12).definition().validationMode());
    }

    @Test
    void resolvesRelativeFilesAndDefaultsAndInfersFeature() throws Exception {
        String sparql = "# caractères UTF-8 : é\nSELECT * WHERE {\n ?s <urn:p>+ ?o\n}\n";
        Files.writeString(directory.resolve("query.rq"), sparql);
        Path catalogue = write("""
                {"defaults":{"timeoutSecs":17,"validationMode":"ordered_exact"},"queries":[
                  {"id":"Q","name":"Example","file":"query.rq","dataset":"test"}]}
                """);
        var query = loader.load(catalogue).getFirst();
        assertEquals(sparql, query.sparql());
        assertEquals(17, query.definition().timeoutSecs());
        assertEquals("ordered_exact", query.definition().validationMode());
        assertEquals(SparqlFeature.PROPERTY_PATH, query.definition().primaryFeature());
        assertEquals(List.of(), query.definition().features());
    }

    @Test
    void preservesExplicitFeatureAndOverridesDefaults() throws Exception {
        Files.writeString(directory.resolve("query.rq"), "SELECT * WHERE { ?s <urn:p>+ ?o }");
        Path catalogue = write("""
                {"defaults":{"timeoutSecs":17},"queries":[
                  {"id":"Q","name":"Example","file":"query.rq","dataset":"test",
                   "primaryFeature":"BGP_JOIN","timeoutSecs":9}]}
                """);
        var definition = loader.load(catalogue).getFirst().definition();
        assertEquals(SparqlFeature.BGP_JOIN, definition.primaryFeature());
        assertEquals(9, definition.timeoutSecs());
        assertEquals("unordered_exact", definition.validationMode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{broken", "{\"queries\":{}}", "{\"queries\":[null]}"})
    void rejectsMalformedCatalogues(String json) throws Exception {
        Path catalogue = write(json);
        assertThrows(IOException.class, () -> loader.load(catalogue));
    }

    @ParameterizedTest
    @ValueSource(strings = {"../escape.rq", "/tmp/escape.rq", "query.txt", "missing.rq"})
    void rejectsInvalidFileReferences(String file) throws Exception {
        Path catalogue = write("{\"queries\":[" + entry(file) + "]}");
        assertThrows(IOException.class, () -> loader.load(catalogue));
    }

    @Test
    void rejectsSymlinkOutsideCatalogue(@TempDir Path outside) throws Exception {
        Path target = Files.writeString(outside.resolve("external.rq"), "SELECT * WHERE {}");
        try {
            Files.createSymbolicLink(directory.resolve("query.rq"), target);
        } catch (UnsupportedOperationException | FileSystemException e) {
            // Windows without elevated privileges or Developer Mode cannot create symlinks
            Assumptions.assumeTrue(false, "Symlink creation not supported: " + e.getMessage());
        }
        Path catalogue = write("{\"queries\":[" + entry("query.rq") + "]}");
        assertThrows(IOException.class, () -> loader.load(catalogue));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "  ", "SELECT broken"})
    void rejectsEmptyOrUnclassifiableQuery(String sparql) throws Exception {
        Files.writeString(directory.resolve("query.rq"), sparql);
        Path catalogue = write("{\"queries\":[" + entry("query.rq") + "]}");
        assertThrows(IOException.class, () -> loader.load(catalogue));
    }

    @Test
    void rejectsDuplicateIds() throws Exception {
        Files.writeString(directory.resolve("query.rq"), "SELECT * WHERE {}");
        String entry = entry("query.rq");
        Path catalogue = write("{\"queries\":[" + entry + "," + entry + "]}");
        assertThrows(IOException.class, () -> loader.load(catalogue));
    }

    private Path write(String json) throws IOException {
        return Files.writeString(directory.resolve("catalogue.json"), json);
    }

    private static String entry(String file) {
        return """
                {"id":"Q","name":"Example","file":"%s","dataset":"test"}
                """.formatted(file);
    }
}
