package fr.inria.corese.benchmark.driver;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.File;
import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class BenchmarkFormatTest {

    @ParameterizedTest
    @CsvSource({"nt,NTRIPLES", "ntriples,NTRIPLES", "NQ,NQUADS", "nquads,NQUADS",
            "ttl,TURTLE", ".ttl,TURTLE", "turtle,TURTLE", "trig,TRIG", "rdf,RDFXML",
            "rdfxml,RDFXML", "rdf/xml,RDFXML", "jsonld,JSONLD", "json-ld,JSONLD"})
    void parsesCanonicalTokensAndAliases(String token, BenchmarkFormat expected) {
        assertEquals(expected, BenchmarkFormat.fromToken(token));
    }

    @Test
    void validatesCsvAndReturnsImmutableFormats() {
        assertTrue(BenchmarkFormat.parseFormatList(null).isEmpty());
        assertTrue(BenchmarkFormat.parseFormatList("  ").isEmpty());
        var formats = BenchmarkFormat.parseFormatList("nt, .TTL,turtle");
        assertEquals(java.util.Set.of(BenchmarkFormat.NTRIPLES, BenchmarkFormat.TURTLE), formats);
        assertThrows(UnsupportedOperationException.class, () -> formats.add(BenchmarkFormat.TRIG));
        for (String token : new String[]{"", " ", "html", "rdfa", "unknown"}) {
            assertThrows(IllegalArgumentException.class, () -> BenchmarkFormat.fromToken(token));
        }
        assertThrows(IllegalArgumentException.class, () -> BenchmarkFormat.fromToken(null));
        for (String csv : new String[]{"nt,,ttl", "nt,foo", ",nt", "nt,"}) {
            assertThrows(IllegalArgumentException.class, () -> BenchmarkFormat.parseFormatList(csv));
        }
    }

    @ParameterizedTest
    @CsvSource({
        "data.nt, NTRIPLES, false",
        "data.NT, NTRIPLES, false",
        "data.nq, NQUADS, true",
        "data.NQ, NQUADS, true",
        "dataset.ttl, TURTLE, false",
        "dataset.TTL, TURTLE, false",
        "dataset.trig, TRIG, true",
        "dataset.TRIG, TRIG, true",
        "dataset.rdf, RDFXML, false",
        "dataset.xml, RDFXML, false",
        "dataset.jsonld, JSONLD, true"
    })
    void testFromFileName(String fileName, BenchmarkFormat expectedFormat, boolean supportsNamedGraphs) {
        Optional<BenchmarkFormat> opt = BenchmarkFormat.fromFileName(fileName);
        assertTrue(opt.isPresent(), "Should recognize " + fileName);
        assertEquals(expectedFormat, opt.get());
        assertEquals(supportsNamedGraphs, opt.get().supportsNamedGraphs());
    }

    @ParameterizedTest
    @CsvSource({
        "data.nt, true", "data.NQ, true", "data.ttl, true",
        "data.TRIG, true", "data.rdf, true", "data.JSONLD, true",
        "data.html, false", "data.HTML, false", "data.xhtml, false",
        "data.htm, false", "data.xml, false", "data.json, false",
        "data.ttl.html, false", "data.ttl.bak, false"
    })
    void testCanonicalDatasetFiles(String fileName, boolean expected) {
        assertEquals(expected, BenchmarkFormat.isCanonicalFile(new File(fileName)));
    }

    @Test
    void testNullCanonicalFile() {
        assertFalse(BenchmarkFormat.isCanonicalFile(null));
    }

    @Test
    void testFromPathAndFile() {
        Path path = Path.of("sample", "test.ttl");
        Optional<BenchmarkFormat> fromPath = BenchmarkFormat.fromPath(path);
        assertTrue(fromPath.isPresent());
        assertEquals(BenchmarkFormat.TURTLE, fromPath.get());

        File file = new File("sample", "test.trig");
        Optional<BenchmarkFormat> fromFile = BenchmarkFormat.fromFile(file);
        assertTrue(fromFile.isPresent());
        assertEquals(BenchmarkFormat.TRIG, fromFile.get());
    }

    @Test
    void testUnsupportedOrBlankExtensions() {
        assertFalse(BenchmarkFormat.fromFileName(null).isPresent());
        assertFalse(BenchmarkFormat.fromFileName("").isPresent());
        assertFalse(BenchmarkFormat.fromFileName("data.txt").isPresent());
        assertFalse(BenchmarkFormat.fromFileName("data.json").isPresent());
        assertFalse(BenchmarkFormat.fromFileName("data.unknown").isPresent());
    }
}
