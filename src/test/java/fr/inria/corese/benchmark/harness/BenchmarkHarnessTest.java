package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.JenaDriver;
import fr.inria.corese.benchmark.metrics.FileResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BenchmarkHarnessTest {

    @Test
    void testMultiFormatDiscoveryAndExecution(@TempDir Path tempDir) throws Exception {
        // Create files with different extensions in non-alphabetical order
        Path trigFile = tempDir.resolve("b_data.trig");
        Files.writeString(trigFile, "@prefix ex: <http://example.org/> .\nex:g { ex:s1 ex:p ex:o1 . }\n");

        Path ntFile = tempDir.resolve("a_data.nt");
        Files.writeString(ntFile, "<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .\n");

        Path ttlFile = tempDir.resolve("c_data.ttl");
        Files.writeString(ttlFile, "@prefix ex: <http://example.org/> .\nex:s3 ex:p ex:o3 .\n");

        // Non-RDF file that must be ignored
        Path ignoredFile = tempDir.resolve("readme.txt");
        Files.writeString(ignoredFile, "This is a text file.");

        JenaDriver driver = new JenaDriver("jena.test");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "test_dataset", 1);

        List<FileResult> results = harness.run(tempDir.toString());

        assertEquals(3, results.size(), "Should discover exactly 3 supported RDF files");
        // Verify alphabetical order
        assertEquals("a_data.nt", results.get(0).file());
        assertEquals("b_data.trig", results.get(1).file());
        assertEquals("c_data.ttl", results.get(2).file());

        // Verify statement count
        assertEquals(1, results.get(0).triples());
        assertEquals(1, results.get(1).triples());
        assertEquals(1, results.get(2).triples());
    }

    @Test
    void testThrowsWhenNoSupportedFiles(@TempDir Path tempDir) {
        JenaDriver driver = new JenaDriver("jena.test");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "empty_dataset", 1);

        assertThrows(IllegalArgumentException.class, () -> harness.run(tempDir.toString()));
    }
}
