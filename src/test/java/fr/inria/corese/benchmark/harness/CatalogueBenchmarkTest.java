package fr.inria.corese.benchmark.harness;

import fr.inria.corese.benchmark.driver.QueryMetrics;
import fr.inria.corese.benchmark.driver.TripleStoreDriver;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import fr.inria.corese.benchmark.query.SparqlCatalogueLoader.LoadedQuery;
import fr.inria.corese.benchmark.query.SparqlQueryDefinition;
import fr.inria.corese.benchmark.report.BenchmarkProtocol;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

class CatalogueBenchmarkTest {
    @TempDir Path directory;
    enum Phase { WARMUP, MEASUREMENT, VALIDATION }

    private LoadedQuery query(String id, int timeout) {
        return new LoadedQuery(new SparqlQueryDefinition(id, id, id + ".rq", "lubm",
                SparqlFeature.NEGATION, List.of(), timeout, "unordered_exact"), "SELECT * WHERE {} # " + id);
    }

    private BenchmarkHarness harness(StubDriver driver, int warmup, long timeoutMs) throws Exception {
        Files.writeString(directory.resolve("data.nt"), "<urn:s> <urn:p> <urn:o> .");
        return new BenchmarkHarness(driver, "lubm", new BenchmarkProtocol(warmup, 1, 1, timeoutMs, 1000, "median"));
    }

    @Test
    void keepsExplicitCatalogueMetadataAndPhaseOrder() throws Exception {
        StubDriver driver = new StubDriver();
        var results = harness(driver, 1, 1000).runCatalogueBenchmark(directory.toString(),
                List.of(query("Q01", 2), query("Q07", 3)));
        assertEquals(List.of("Q01", "Q07"), results.stream().map(r -> r.queryId()).toList());
        assertTrue(results.stream().allMatch(r -> "NEGATION".equals(r.queryCategory()) && "PASS".equals(r.status())));
        assertEquals(List.of("warmup", "warmup", "measurement", "measurement", "validation", "validation"), driver.calls);
        assertTrue(driver.closed);
    }

    @ParameterizedTest
    @EnumSource(Phase.class)
    void catalogueTimeoutBoundsEveryPhase(Phase phase) throws Exception {
        StubDriver driver = new StubDriver();
        driver.blockedPhase = phase;
        var results = harness(driver, 1, 10_000).runCatalogueBenchmark(directory.toString(), List.of(query("Q01", 1)));
        assertTrue(driver.interrupted.await(1, TimeUnit.SECONDS), "Catalogue timeout must interrupt " + phase);
        assertEquals(switch (phase) {
            case WARMUP -> "PASS";
            case MEASUREMENT -> "TIMEOUT";
            case VALIDATION -> "ERROR";
        }, results.getFirst().status());
        assertEquals("Q01", results.getFirst().queryId());
        assertTrue(driver.closed);
    }

    @Test
    void catalogueTimeoutCanExceedProtocolDefaultAndVaryBetweenQueries() throws Exception {
        StubDriver driver = new StubDriver();
        driver.delayMeasurements = true;
        var results = harness(driver, 0, 1000).runCatalogueBenchmark(directory.toString(),
                List.of(query("short", 1), query("long", 3)));
        assertEquals(List.of("TIMEOUT", "PASS"), results.stream().map(r -> r.status()).toList());
    }

    @Test
    void legacyApiKeepsIdsCategoriesAndProtocolTimeout() throws Exception {
        StubDriver driver = new StubDriver();
        driver.blockedPhase = Phase.MEASUREMENT;
        String sparql = "SELECT * WHERE {}";
        var results = harness(driver, 0, 1000).runQueryBenchmark(directory.toString(), List.of("  ", sparql));
        assertEquals(1, results.size());
        assertEquals("query_2", results.getFirst().queryId());
        assertEquals(SparqlAnalyser.classify(sparql).name(), results.getFirst().queryCategory());
        assertEquals("TIMEOUT", results.getFirst().status());
    }

    static class StubDriver implements TripleStoreDriver {
        final java.util.ArrayList<String> calls = new java.util.ArrayList<>();
        final CountDownLatch interrupted = new CountDownLatch(1);
        Phase blockedPhase;
        boolean delayMeasurements;
        boolean closed;
        public void init() { }
        public void load(String path) { }
        public void clear() { }
        public void close() { closed = true; }
        public String getName() { return "stub"; }
        public long getGraphSize() { return 1; }
        public long query(String sparql) { return 1; }
        private void execute(Phase phase) throws InterruptedException {
            calls.add(phase.name().toLowerCase());
            try {
                if (phase == blockedPhase) new CountDownLatch(1).await();
                if (phase == Phase.MEASUREMENT && delayMeasurements) Thread.sleep(1400);
            } catch (InterruptedException e) {
                interrupted.countDown();
                throw e;
            }
        }
        public long[] queryWithCount(String sparql) throws Exception {
            execute(Phase.WARMUP);
            return new long[]{1, 1};
        }
        public QueryMetrics queryWithMetrics(String sparql) throws Exception {
            execute(Phase.MEASUREMENT);
            return new QueryMetrics(1, 1, 1, 0);
        }
        public ValidationResult validateResult(String sparql) throws Exception {
            execute(Phase.VALIDATION);
            return new ValidationResult("hash", false);
        }
    }
}
