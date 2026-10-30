package fr.inria.corese.benchmark.report;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
import fr.inria.corese.benchmark.telemetry.SystemEnvironmentCollector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.stream.Collectors;

/**
 * Generates benchmark-report.json consumed by the dashboard.
 */
public final class BenchmarkReport {

    private BenchmarkReport() {}

    private static final Logger log = LoggerFactory.getLogger(BenchmarkReport.class);

    /**
     * Writes benchmark results to a JSON file and a sibling CSV file.
     *
     * <p>The JSON file is written to {@code outputPath}. The CSV file is placed in
     * a {@code csv/} directory that is a sibling of the JSON file's parent directory,
     * using the same filename with a {@code .csv} extension.</p>
     *
     * <p>The JSON structure contains a {@code metadata} block (timestamp, protocol,
     * Java version, OS), a {@code runs} array of {@link FileResult} objects, and an
     * optional {@code queryRuns} array of {@link QueryResult} objects.</p>
     *
     * @param results      load-benchmark results (may be empty but not {@code null})
     * @param queryResults query-benchmark results; {@code null} or empty means the
     *                     {@code queryRuns} section is omitted from the report
     * @param outputPath   path of the JSON output file; parent directories must exist
     * @throws Exception if serialisation or file I/O fails
     */
    public static void write(List<FileResult> results, List<QueryResult> queryResults, List<String> queries, String outputPath) throws Exception {
        Map<String, Object> report = new LinkedHashMap<>();

        // Metadata
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("version", "2.0.0");
        metadata.put("generatedAt", Instant.now().toString());

        try {
            metadata.put("environment", SystemEnvironmentCollector.collect());
        } catch (Exception e) {
            log.warn("Could not collect system environment metadata: {}", e.getMessage());
        }

        Map<String, Object> protocol = new LinkedHashMap<>();
        protocol.put("warmup", true);
        protocol.put("repetitions", 3);
        protocol.put("queryRepetitions", 3);
        metadata.put("protocol", protocol);
        metadata.put("java", System.getProperty("java.version"));
        metadata.put("os", System.getProperty("os.name"));
        // Embed SPARQL queries so the dashboard can display them without external files
        if (queries != null && !queries.isEmpty()) {
            metadata.put("queries", queries);
        }
        report.put("metadata", metadata);

        // Load benchmark runs (both 'runs' and 'loadingRuns' for v1 and v2 compatibility)
        report.put("runs", results);
        report.put("loadingRuns", results);

        // Query benchmark runs (optional)
        if (queryResults != null && !queryResults.isEmpty()) {
            report.put("queryRuns", queryResults);
        }

        Path jsonPath = Path.of(outputPath);

        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        // Records have private fields with no JavaBean getters — expose all fields
        mapper.setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);
        mapper.writeValue(jsonPath.toFile(), report);
        log.info("Report written to: {}", outputPath);

        // CSV — sibling csv/ directory alongside json/ if possible, otherwise alongside the json file
        try {
            Path csvDir = resolveCsvDirectory(jsonPath);
            Files.createDirectories(csvDir);
            Path csvPath = csvDir.resolve(jsonPath.getFileName().toString().replace(".json", ".csv"));
            writeCsv(results, queryResults, csvPath.toString());
            log.info("CSV written to: {}", csvPath);
        } catch (Exception e) {
            log.warn("Could not generate sibling CSV for {}: {}", outputPath, e.getMessage());
        }
    }

    private static Path resolveCsvDirectory(Path jsonPath) {
        Path parent = jsonPath.getParent();
        if (parent == null) {
            return Path.of("csv");
        }
        Path grandParent = parent.getParent();
        if (grandParent != null) {
            return grandParent.resolve("csv");
        }
        return parent.resolve("csv");
    }

    /**
     * Writes results to a CSV file with two labelled sections: {@code # LOAD BENCHMARK}
     * and (optionally) {@code # QUERY BENCHMARK}.
     *
     * @param results      load-benchmark results
     * @param queryResults query-benchmark results; {@code null} or empty skips the query section
     * @param csvPath      absolute path of the CSV file to create or overwrite
     * @throws Exception if file I/O fails
     */
    private static void writeCsv(List<FileResult> results, List<QueryResult> queryResults, String csvPath) throws Exception {
        try (PrintWriter pw = new PrintWriter(csvPath)) {
            // Load benchmark section
            pw.println("# LOAD BENCHMARK");
            pw.println("engine,dataset,file,triples,loadingTimeMs,throughputTriplesPerSec,memoryBeforeMb,memoryAfterMb,memoryDeltaMb,cpuPercent,rep1Ms,rep2Ms,rep3Ms");
            for (FileResult r : results) {
                String reps = Arrays.stream(r.repetitionsMs())
                    .mapToObj(String::valueOf)
                    .collect(Collectors.joining(","));
                pw.printf(Locale.US, "%s,%s,%s,%d,%d,%.2f,%.2f,%.2f,%.2f,%.2f,%s%n",
                    r.engine(), r.dataset(), r.file(), r.triples(),
                    r.loadingTimeMs(), r.throughputTriplesPerSec(),
                    r.memoryBeforeMb(), r.memoryAfterMb(), r.memoryDeltaMb(),
                    r.cpuPercent(), reps);
            }

            // Query benchmark section (optional)
            if (queryResults != null && !queryResults.isEmpty()) {
                pw.println();
                pw.println("# QUERY BENCHMARK");
                pw.println("engine,dataset,queryId,queryCategory,medianMs,medianTtfrMs,heapDeltaMb,rowCount,resultHash,status,rep1Ms,rep2Ms,rep3Ms");
                for (QueryResult r : queryResults) {
                    String reps = Arrays.stream(r.repetitionsMs())
                        .mapToObj(String::valueOf)
                        .collect(Collectors.joining(","));
                    pw.printf(Locale.US, "%s,%s,%s,%s,%d,%d,%.3f,%d,%s,%s,%s%n",
                        r.engine(), r.dataset(), r.queryId(), r.queryCategory(),
                        r.medianMs(), r.medianTtfrMs(), r.heapDeltaMb(),
                        r.rowCount(), r.resultHash(), r.status(), reps);
                }
            }
        }
    }
}
