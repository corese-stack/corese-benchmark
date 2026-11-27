package fr.inria.corese.benchmark;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ConvertDatasetsTest {
    @TempDir Path directory;

    @Test
    void generatesOnlyRequestedFormats() throws Exception {
        Path source = directory.resolve("data.nt");
        Files.writeString(source, "<urn:s> <urn:p> <urn:o> .");
        Path existing = directory.resolve("data.rdf");
        ConvertDatasets.main(new String[]{"--formats", "ttl,jsonld", source.toString()});
        assertTrue(Files.size(directory.resolve("data.ttl")) > 0);
        assertTrue(Files.size(directory.resolve("data.jsonld")) > 0);
        assertFalse(Files.exists(existing));
        Files.writeString(existing, "preserve existing output");
        ConvertDatasets.main(new String[]{source.toString(), "--formats=ttl,jsonld"});
        assertEquals("preserve existing output", Files.readString(existing));
        for (String extension : List.of("nq", "trig", "html")) {
            assertFalse(Files.exists(directory.resolve("data." + extension)));
        }
    }

    @Test
    void sourceOnlyDoesNotParseOrGenerateFiles() throws Exception {
        Path source = directory.resolve("data.nt");
        Files.writeString(source, "invalid RDF must not be parsed");
        ConvertDatasets.main(new String[]{directory.toString(), "--formats=nt"});
        assertEquals("invalid RDF must not be parsed", Files.readString(source));
        try (var files = Files.list(directory)) {
            assertEquals(List.of(source), files.toList());
        }
    }

    @Test
    void emptyFormatsFilterConvertsAllFormats() throws Exception {
        Path source = directory.resolve("data.nt");
        Files.writeString(source, "<http://example.org/s> <http://example.org/p> <http://example.org/o> .");
        ConvertDatasets.main(new String[]{source.toString(), "--formats="});
        for (String extension : List.of("ttl", "rdf", "jsonld", "nq", "trig", "html")) {
            assertTrue(Files.size(directory.resolve("data." + extension)) > 0, "Missing converted ." + extension);
        }
    }

    @Test
    void invalidFilterFailsBeforeConversion() throws Exception {
        Path source = directory.resolve("data.nt");
        Files.writeString(source, "invalid RDF");
        for (String filter : List.of("foo", "nt,,ttl", "html")) {
            String[] argv = {source.toString(), "--formats=" + filter};
            assertThrows(IllegalArgumentException.class, () -> ConvertDatasets.main(argv));
        }
    }

    @Test
    void convertsSymlinkedViewIntoBackingStoreAndLinksOutputs() throws Exception {
        Path unzip = Files.createDirectory(directory.resolve("unzip"));
        Path view = Files.createDirectory(directory.resolve("view"));
        Path backing = Files.writeString(unzip.resolve("data.nt"), "<urn:s> <urn:p> <urn:o> .");
        Path link = view.resolve("data.nt");
        try {
            Files.createSymbolicLink(link, backing);
        } catch (UnsupportedOperationException | java.io.IOException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symlinks unsupported: " + e.getMessage());
        }
        ConvertDatasets.main(new String[]{"--formats=ttl,jsonld", view.toString()});
        for (String ext : List.of("ttl", "jsonld")) {
            Path stored = unzip.resolve("data." + ext);
            Path exposed = view.resolve("data." + ext);
            assertTrue(Files.size(stored) > 0, "Missing backing file " + stored);
            assertTrue(Files.exists(exposed), "Missing view file " + exposed);
            assertEquals(Files.readString(stored), Files.readString(exposed));
        }
    }
}
