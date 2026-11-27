package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.QueryMetrics;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.driver.TripleStoreDriver.ValidationResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.report.BenchmarkProtocol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class HarnessReliabilityTest {

    private static Path prepareDummyDataset(Path dir) throws IOException {
        Path f = dir.resolve("data.nt");
        Files.writeString(f, "<http://example.org/s> <http://example.org/p> <http://example.org/o> .\n");
        return dir;
    }

    static class ControllableMockDriver implements TripleStoreDriver {
        private final String name;
        private final AtomicInteger invocationCounter = new AtomicInteger(0);

        // Callbacks / Behaviors per invocation
        java.util.function.Function<Integer, QueryMetrics> metricGenerator = idx -> new QueryMetrics(1.5, 1.2, 5, 1024);
        java.util.function.Function<String, ValidationResult> validator = s -> new ValidationResult("validHash123", false);

        ControllableMockDriver(String name) {
            this.name = name;
        }

        @Override public void init() { /* No-op in mock driver */ }
        @Override public void load(String filePath) { /* No-op in mock driver */ }
        @Override public long query(String sparql) { return 1L; }
        @Override public long getGraphSize() { return 1L; }
        @Override public void clear() { /* No-op in mock driver */ }
        @Override public void close() { /* No-op in mock driver */ }
        @Override public String getName() { return name; }

        @Override
        public QueryMetrics queryWithMetrics(String sparql) {
            int idx = invocationCounter.getAndIncrement();
            return metricGenerator.apply(idx);
        }

        @Override
        public ValidationResult validateResult(String sparql) {
            return validator.apply(sparql);
        }
    }

    @Test
    @DisplayName("1. Complete success: all repetitions succeed with identical count and hash -> PASS")
    void testCompleteSuccess(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.pass");
        driver.metricGenerator = idx -> new QueryMetrics(10.5, 5.2, 42, 2048);
        driver.validator = s -> new ValidationResult("canonHashABC", false);

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 5_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("PASS", qr.status());
        assertEquals(42, qr.rowCount());
        assertEquals("canonHashABC", qr.resultHash());
        assertEquals(10.5, qr.medianMs(), 0.001);
        assertEquals(3, qr.repetitionsStatuses().length);
        assertArrayEquals(new String[]{"PASS", "PASS", "PASS"}, qr.repetitionsStatuses());
    }

    @Test
    @DisplayName("2. Partial success: 1 timeout and 2 passes must yield UNSTABLE (never PASS)")
    void testPartialSuccessNeverPass(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.partial");
        driver.metricGenerator = idx -> {
            if (idx == 0) {
                try {
                    Thread.sleep(1500); // Exceeds 1s query timeout
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return new QueryMetrics(1500.0, 1500.0, 42, 0);
            }
            return new QueryMetrics(8.0, 4.0, 42, 1024);
        };

        // Query timeout = 1 second (1000 ms)
        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 1_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("UNSTABLE", qr.status(), "A run with 1 timeout and 2 successes MUST be UNSTABLE and NEVER PASS");
        assertEquals(-1L, qr.rowCount(), "Unstable query rowCount must be sanitized to -1");
        assertEquals("TIMEOUT", qr.repetitionsStatuses()[0]);
        assertEquals("PASS", qr.repetitionsStatuses()[1]);
        assertEquals("PASS", qr.repetitionsStatuses()[2]);
        assertTrue(qr.repetitionErrors().get(0).contains("Timeout"));
    }

    @Test
    @DisplayName("3. Complete timeouts: all repetitions expire -> TIMEOUT")
    void testCompleteTimeouts(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.timeout");
        driver.metricGenerator = idx -> {
            try {
                Thread.sleep(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return new QueryMetrics(1500.0, 1500.0, 42, 0);
        };

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 1_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("TIMEOUT", qr.status());
        assertEquals(-1L, qr.rowCount());
        assertEquals(-1.0, qr.medianMs());
        assertArrayEquals(new String[]{"TIMEOUT", "TIMEOUT", "TIMEOUT"}, qr.repetitionsStatuses());
    }

    @Test
    @DisplayName("4. Complete errors: all repetitions throw exceptions -> ERROR")
    void testCompleteErrors(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.error");
        driver.metricGenerator = idx -> {
            throw new RuntimeException("Syntax error in query pattern");
        };

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 5_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("ERROR", qr.status());
        assertEquals(-1L, qr.rowCount());
        assertArrayEquals(new String[]{"ERROR", "ERROR", "ERROR"}, qr.repetitionsStatuses());
        assertTrue(qr.repetitionErrors().get(0).contains("Syntax error"));
    }

    @Test
    @DisplayName("5. Mixed TIMEOUT and ERROR -> UNSTABLE with preserved error causes")
    void testMixedTimeoutAndError(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.mixed");
        driver.metricGenerator = idx -> {
            if (idx == 0) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return new QueryMetrics(1500.0, 1500.0, -1, 0);
            }
            throw new IllegalStateException("Storage disk failure");
        };

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 1_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("UNSTABLE", qr.status(), "Mixture of TIMEOUT and ERROR must result in UNSTABLE");
        assertEquals("TIMEOUT", qr.repetitionsStatuses()[0]);
        assertEquals("ERROR", qr.repetitionsStatuses()[1]);
        assertEquals("ERROR", qr.repetitionsStatuses()[2]);
        assertTrue(qr.repetitionErrors().get(0).contains("Timeout"));
        assertTrue(qr.repetitionErrors().get(1).contains("Storage disk failure"));
    }

    @Test
    @DisplayName("6. Divergence of rowCount across repetitions -> UNSTABLE")
    void testRowCountDivergenceYieldsUnstable(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.nondet");
        // Non-deterministic engine returning varying row counts
        driver.metricGenerator = idx -> new QueryMetrics(12.0, 5.0, idx == 1 ? 15 : 10, 1024);

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 5_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("UNSTABLE", qr.status());
        assertEquals(-1L, qr.rowCount());
        assertTrue(qr.resultHash().isEmpty(), "Unstable row count must not emit a validated hash");
    }

    @Test
    @DisplayName("7. Empty but valid results (0 rows) -> PASS with rowCount 0")
    void testEmptyValidResult(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.empty");
        driver.metricGenerator = idx -> new QueryMetrics(4.2, 4.2, 0, 512);
        driver.validator = s -> new ValidationResult("emptySeqHash456", false);

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 5_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("PASS", qr.status());
        assertEquals(0L, qr.rowCount());
        assertEquals("emptySeqHash456", qr.resultHash());
    }

    @Test
    @DisplayName("8. Sub-millisecond fast queries: nanoTime preserves precision, avoids 0 ms truncation")
    void testSubMillisecondFastQuery(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.fast");
        // Query taking 280 microseconds = 0.280 ms
        driver.metricGenerator = idx -> new QueryMetrics(0.280, 0.280, 1, 128);

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 3, 3, 5_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("ASK WHERE { ?s ?p ?o }"));
        assertEquals(1, results.size());

        QueryResult qr = results.get(0);
        assertEquals("PASS", qr.status());
        assertTrue(qr.medianMs() > 0.0, "Sub-millisecond query must have positive fractional medianMs");
        assertTrue(qr.medianMs() < 1.0, "Sub-millisecond query should be < 1.0 ms");
        assertEquals(0.280, qr.medianMs(), 0.001);
    }

    @Test
    @DisplayName("9. Non-interruptible thread timeout: harness recovers cleanly within bounds")
    void testNonInterruptibleThreadTimeout(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        ControllableMockDriver driver = new ControllableMockDriver("mock.stubborn");
        driver.metricGenerator = idx -> {
            long stop = System.currentTimeMillis() + 1500;
            // Stubborn CPU loop ignoring interrupt flag
            while (System.currentTimeMillis() < stop) {
                // spin without checking Thread.interrupted()
            }
            return new QueryMetrics(1500.0, 1500.0, 1, 0);
        };

        // Timeout 1s
        BenchmarkProtocol proto = new BenchmarkProtocol(0, 1, 1, 1_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        long startTest = System.currentTimeMillis();
        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of("SELECT * WHERE { ?s ?p ?o }"));
        long elapsed = System.currentTimeMillis() - startTest;

        assertEquals(1, results.size());
        assertEquals("TIMEOUT", results.get(0).status());
        // Harness timeout 1s + awaitTermination 0.5s = ~1.5s, must not hang indefinitely
        assertTrue(elapsed < 4000, "Harness should recover from stubborn thread within reasonable timeout bound");
    }

    @Test
    @DisplayName("10. Thread leak in Q1 aborts all remaining queries (Q2, Q3) to prevent JVM contamination")
    void testThreadLeakAbortsRemainingQueriesInSameJvm(@TempDir Path tempDir) throws Exception {
        prepareDummyDataset(tempDir);
        AtomicInteger executedQueries = new AtomicInteger(0);
        ControllableMockDriver driver = new ControllableMockDriver("mock.leak_cascade");
        driver.metricGenerator = idx -> {
            executedQueries.incrementAndGet();
            if (idx == 0) {
                long stop = System.currentTimeMillis() + 4000;
                while (System.currentTimeMillis() < stop) {
                    // Stubborn spin loop exceeding 1s timeout
                }
            }
            return new QueryMetrics(10.0, 10.0, 1, 0);
        };

        BenchmarkProtocol proto = new BenchmarkProtocol(0, 1, 1, 1_000L, 30_000L, "median");
        BenchmarkHarness harness = new BenchmarkHarness(driver, "dataset_test", proto);

        List<QueryResult> results = harness.runQueryBenchmark(tempDir.toString(), List.of(
            "SELECT * WHERE { ?s ?p ?o1 }",
            "SELECT * WHERE { ?s ?p ?o2 }",
            "SELECT * WHERE { ?s ?p ?o3 }"
        ));

        assertEquals(3, results.size());
        assertEquals("TIMEOUT", results.get(0).status());
        assertTrue(results.get(0).repetitionErrors().get(0).contains("thread leak"));

        // Q2 and Q3 must be marked skipped due to contamination without invoking the driver
        assertEquals("ERROR", results.get(1).status());
        assertTrue(results.get(1).repetitionErrors().get(0).contains("contaminated JVM"));
        assertEquals("ERROR", results.get(2).status());
        assertTrue(results.get(2).repetitionErrors().get(0).contains("contaminated JVM"));

        // Driver must only have been invoked for Q1, never for Q2 or Q3
        assertEquals(1, executedQueries.get(), "Driver must never be executed for subsequent queries after thread leak");
    }
}
