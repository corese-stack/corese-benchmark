package fr.inria.corese.benchmark.report;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import fr.inria.corese.benchmark.metrics.FileResult;
import fr.inria.corese.benchmark.metrics.QueryResult;
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
public class BenchmarkReport {

    private static final Logger log = LoggerFactory.getLogger(BenchmarkReport.class);

    public static void write(List<FileResult> results, List<QueryResult> queryResults, String outputPath) throws Exception {
        Map<String, Object> report = new LinkedHashMap<>();

        // Metadata
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("generatedAt", Instant.now().toString());
        Map<String, Object> protocol = new LinkedHashMap<>();
        protocol.put("warmup", true);
        protocol.put("repetitions", 3);
        protocol.put("queryRepetitions", 3);
        metadata.put("protocol", protocol);
        metadata.put("java", System.getProperty("java.version"));
        metadata.put("os", System.getProperty("os.name"));
        report.put("metadata", metadata);

        // Load benchmark runs
        report.put("runs", results);

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

        // CSV — sibling csv/ directory alongside json/
        Path csvDir = jsonPath.getParent().getParent().resolve("csv");
        Files.createDirectories(csvDir);
        Path csvPath = csvDir.resolve(jsonPath.getFileName().toString().replace(".json", ".csv"));
        writeCsv(results, queryResults, csvPath.toString());
        log.info("CSV written to: {}", csvPath);
    }

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
                pw.println("engine,dataset,queryId,medianMs,rep1Ms,rep2Ms,rep3Ms");
                for (QueryResult r : queryResults) {
                    String reps = Arrays.stream(r.repetitionsMs())
                        .mapToObj(String::valueOf)
                        .collect(Collectors.joining(","));
                    pw.printf(Locale.US, "%s,%s,%s,%d,%s%n",
                        r.engine(), r.dataset(), r.queryId(), r.medianMs(), reps);
                }
            }
        }
    }
}
