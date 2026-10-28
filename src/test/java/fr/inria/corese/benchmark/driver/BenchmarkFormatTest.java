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
    @CsvSource({
        "data.nt, NTRIPLES, false",
        "data.NT, NTRIPLES, false",
        "data.nq, NQUADS, true",
        "data.NQ, NQUADS, true",
        "dataset.ttl, TURTLE, false",
        "dataset.TTL, TURTLE, false",
        "dataset.trig, TRIG, true",
        "dataset.TRIG, TRIG, true"
    })
    void testFromFileName(String fileName, BenchmarkFormat expectedFormat, boolean supportsNamedGraphs) {
        Optional<BenchmarkFormat> opt = BenchmarkFormat.fromFileName(fileName);
        assertTrue(opt.isPresent(), "Should recognize " + fileName);
        assertEquals(expectedFormat, opt.get());
        assertEquals(supportsNamedGraphs, opt.get().supportsNamedGraphs());
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
        assertFalse(BenchmarkFormat.fromFileName("data.xml").isPresent());
        assertFalse(BenchmarkFormat.fromFileName("data.json").isPresent());
        assertFalse(BenchmarkFormat.fromFileName("data.unknown").isPresent());
    }
}
