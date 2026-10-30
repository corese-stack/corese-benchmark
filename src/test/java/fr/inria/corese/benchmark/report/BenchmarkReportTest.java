package fr.inria.corese.benchmark.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.telemetry.TelemetryPoint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BenchmarkReportTest {

    @Test
    void reportSerializesJsonV2SchemaProperly(@TempDir Path tempDir) throws Exception {
        Path jsonOut = tempDir.resolve("json/benchmark-report.json");
        Files.createDirectories(jsonOut.getParent());

        List<TelemetryPoint> timeSeries = List.of(
            new TelemetryPoint(0L, 0L, 42.5),
            new TelemetryPoint(100L, 0L, 65.2),
            new TelemetryPoint(250L, 5000L, 88.0)
        );

        FileResult fileResult = new FileResult(
            "corese.next",
            "bowlogna",
            "test.ttl",
            5000L,
            250L,
            20000.0,
            40.0,
            88.0,
            48.0,
            15.0,
            new long[]{240L, 250L, 260L},
            timeSeries
        );

        QueryResult queryResult = new QueryResult(
            "corese.next",
            "bowlogna",
            "query_1",
            "AGGREGATION",
            12L,
            new long[]{12L, 13L, 11L},
            5L,
            new long[]{5L, 6L, 5L},
            1.2,
            42L,
            "hash123",
            "PASS"
        );

        BenchmarkProtocol protocol = new BenchmarkProtocol(1, 3, 3, 45_000L, 600_000L, "median");

        BenchmarkReport.write(
            List.of(fileResult),
            List.of(queryResult),
            List.of("SELECT * WHERE { ?s ?p ?o }"),
            jsonOut.toString(),
            protocol
        );

        assertTrue(Files.exists(jsonOut), "JSON report should be generated");

        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(jsonOut.toFile());

        // Verify metadata block
        assertTrue(root.has("metadata"), "Report must contain metadata");
        JsonNode metadata = root.get("metadata");
        assertEquals("2.0", metadata.get("version").asText());
        assertTrue(metadata.has("generatedAt"));

        // Verify protocol
        assertTrue(metadata.has("protocol"));
        JsonNode protoNode = metadata.get("protocol");
        assertEquals(1, protoNode.get("warmup").asInt());
        assertEquals(3, protoNode.get("repetitions").asInt());
        assertEquals(45_000L, protoNode.get("queryTimeoutMs").asLong());
        assertEquals(600_000L, protoNode.get("loadTimeoutMs").asLong());
        assertEquals("median", protoNode.get("metric").asText());

        // Verify environment
        assertTrue(metadata.has("environment"));
        JsonNode envNode = metadata.get("environment");
        assertTrue(envNode.has("cpuModel"));
        assertTrue(envNode.has("cpuArchitecture"));
        assertTrue(envNode.has("ramTotalGb"));
        assertTrue(envNode.has("jvmVersion"));

        // Verify loading runs (both v2 'loadingRuns' and legacy 'runs' for python-utils compatibility)
        assertTrue(root.has("loadingRuns"), "Must export 'loadingRuns' for v2 dashboard");
        assertTrue(root.has("runs"), "Must export 'runs' for backward compatibility");
        assertEquals(1, root.get("loadingRuns").size());
        assertEquals(1, root.get("runs").size());

        // Verify timeSeries on loadingRun
        JsonNode run = root.get("loadingRuns").get(0);
        assertTrue(run.has("timeSeries"), "FileResult must contain timeSeries");
        JsonNode ts = run.get("timeSeries");
        assertEquals(3, ts.size());
        assertEquals(0L, ts.get(0).get("elapsedMs").asLong());
        assertEquals(42.5, ts.get(0).get("heapUsedMb").asDouble());
        assertEquals(5000L, ts.get(2).get("triplesLoaded").asLong());

        // Verify queryRuns
        assertTrue(root.has("queryRuns"));
        assertEquals(1, root.get("queryRuns").size());
        assertEquals("query_1", root.get("queryRuns").get(0).get("queryId").asText());
        assertEquals("PASS", root.get("queryRuns").get(0).get("status").asText());
    }
}
