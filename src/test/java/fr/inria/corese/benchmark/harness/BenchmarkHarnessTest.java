package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.JenaDriver;
import fr.inria.corese.benchmark.driver.BenchmarkFormat;
import fr.inria.corese.benchmark.report.BenchmarkProtocol;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.FileStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.EnumSet;
import java.util.Set;

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

    @ParameterizedTest
    @ValueSource(ints = {0, 1})
    void testMalformedFileDoesNotSkipOtherFormats(int warmup, @TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve("a_broken.ttl"), "this is not valid Turtle");
        Files.writeString(tempDir.resolve("b_valid.nt"),
                "<http://example.org/s> <http://example.org/p> <http://example.org/o> .");
        Files.writeString(tempDir.resolve("c_valid.nq"),
                "<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .");
        Files.writeString(tempDir.resolve("d_valid.ttl"),
                "<http://example.org/s> <http://example.org/p> <http://example.org/o> .");
        Files.writeString(tempDir.resolve("e_valid.trig"),
                "<http://example.org/g> { <http://example.org/s> <http://example.org/p> <http://example.org/o> . }");
        Files.writeString(tempDir.resolve("f_valid.rdf"),
                """
                <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="http://example.org/">
                  <rdf:Description rdf:about="http://example.org/s"><ex:p rdf:resource="http://example.org/o"/></rdf:Description>
                </rdf:RDF>
                """);
        Files.writeString(tempDir.resolve("g_valid.jsonld"),
                """
                {"@id":"http://example.org/s","http://example.org/p":{"@id":"http://example.org/o"}}
                """);
        // These would abort discovery or loading if accepted as dataset files.
        for (String extension : List.of("html", "HTML", "htm", "xhtml", "xml", "txt")) {
            Files.writeString(tempDir.resolve("0_residual." + extension), "not RDF");
        }
        BenchmarkProtocol protocol = new BenchmarkProtocol(warmup, 1, 1, 1_000L, 30_000L, "median");
        JenaDriver driver = new JenaDriver("jena.test") {
            @Override
            public Set<BenchmarkFormat> getSupportedFormats() {
                return EnumSet.allOf(BenchmarkFormat.class);
            }
        };
        BenchmarkHarness harness = new BenchmarkHarness(driver, "resilience", protocol);

        List<FileResult> results = harness.run(tempDir.toString());

        assertEquals(List.of("a_broken.ttl", "b_valid.nt", "c_valid.nq", "d_valid.ttl", "e_valid.trig", "f_valid.rdf", "g_valid.jsonld"),
                results.stream().map(FileResult::file).toList());
        assertEquals(FileStatus.ERROR, results.get(0).status());
        assertNotNull(results.get(0).errorMessage());
        for (int i = 1; i < results.size(); i++) {
            assertEquals(FileStatus.SUCCESS, results.get(i).status());
            assertEquals(1, results.get(i).triples(), "Valid files must be loaded successfully");
        }
    }

    @Test
    void testDriverClearFailureDoesNotAbortNextFile(@TempDir Path tempDir) throws Exception {
        String triple = "<http://example.org/s> <http://example.org/p> <http://example.org/o> .";
        Files.writeString(tempDir.resolve("a_first.nt"), triple);
        Files.writeString(tempDir.resolve("b_second.nt"), triple);
        JenaDriver driver = new JenaDriver("jena.test") {
            private boolean failNextClear = true;

            @Override
            public void clear() {
                if (failNextClear) {
                    failNextClear = false;
                    throw new IllegalStateException("Simulated file preparation failure");
                }
                super.clear();
            }
        };
        BenchmarkHarness harness = new BenchmarkHarness(driver, "clear_failure", 1);

        List<FileResult> results = harness.run(tempDir.toString());

        assertEquals(List.of("a_first.nt", "b_second.nt"), results.stream().map(FileResult::file).toList());
        assertEquals(FileStatus.ERROR, results.get(0).status());
        assertEquals(FileStatus.SUCCESS, results.get(1).status());
        assertEquals(1, results.get(1).triples());
    }

    @Test
    void testThrowsWhenNoSupportedFiles(@TempDir Path tempDir) {
        JenaDriver driver = new JenaDriver("jena.test");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "empty_dataset", 1);

        assertThrows(IllegalArgumentException.class, () -> harness.run(tempDir.toString()));
    }
}
