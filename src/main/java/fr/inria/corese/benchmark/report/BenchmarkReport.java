package fr.inria.corese.benchmark.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import fr.inria.corese.benchmark.metrics.FileResult;

import java.io.File;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

/**
 * Generates benchmark-report.json consumed by the dashboard.
 */
public class BenchmarkReport {

    public static void write(List<FileResult> results, String outputPath) throws Exception {
        Map<String, Object> report = new LinkedHashMap<>();

        // Metadata
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("generatedAt", Instant.now().toString());
        metadata.put("protocol", Map.of("repetitions", 3, "warmup", true));
        metadata.put("java", System.getProperty("java.version"));
        metadata.put("os", System.getProperty("os.name"));
        report.put("metadata", metadata);

        // Runs
        report.put("runs", results);

        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        mapper.writeValue(new File(outputPath), report);

        System.out.println("Report written to: " + outputPath);
    }
}
