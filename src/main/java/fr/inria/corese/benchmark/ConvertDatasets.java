package fr.inria.corese.benchmark;

import org.apache.jena.query.Dataset;
import org.apache.jena.query.DatasetFactory;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFDataMgr;
import org.apache.jena.riot.RDFFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Converts existing N-Triples benchmark datasets to Turtle and TriG formats
 * so they can be used for Turtle/TriG ingestion benchmarks.
 *
 * <p>For each .nt file, produces:
 * <ul>
 *   <li>{@code .ttl} – Turtle with subject grouping</li>
 *   <li>{@code .trig} – TriG with the triples inside a named graph
 *       ({@code <urn:graph:<filename>>})</li>
 * </ul>
 *
 * <p>Run via: {@code ./gradlew convertDatasets}
 */
public class ConvertDatasets {

    private static final Logger log = LoggerFactory.getLogger(ConvertDatasets.class);

    public static void main(String[] args) throws IOException {
        List<Path> inputDirs = List.of(
                Path.of("input/bowlogna/unzip"),
                Path.of("input/lubm/view_small")
        );

        for (Path dir : inputDirs) {
            if (!Files.isDirectory(dir)) {
                log.warn("Skipping (not found): {}", dir);
                continue;
            }

            Path[] ntFiles;
            try (var stream = Files.list(dir)) {
                ntFiles = stream
                        .filter(p -> p.toString().endsWith(".nt"))
                        .sorted()
                        .toArray(Path[]::new);
            }

            log.info("Converting {} file(s) in {} ...", ntFiles.length, dir);

            for (Path ntFile : ntFiles) {
                convertFile(ntFile);
            }
        }

        log.info("Done.");
    }

    private static void convertFile(Path ntFile) throws IOException {
        String baseName = ntFile.getFileName().toString().replaceFirst("\\.nt$", "");
        Path ttlFile  = ntFile.resolveSibling(baseName + ".ttl");
        Path trigFile = ntFile.resolveSibling(baseName + ".trig");

        log.info("Reading  {} ({} lines) ...", ntFile.getFileName(), countLines(ntFile));

        Model model = ModelFactory.createDefaultModel();
        RDFDataMgr.read(model, ntFile.toAbsolutePath().toString(), Lang.NTRIPLES);

        // ── Turtle ────────────────────────────────────────────────────────────
        try (OutputStream out = Files.newOutputStream(ttlFile)) {
            RDFDataMgr.write(out, model, RDFFormat.TURTLE_PRETTY);
        }
        log.info("Wrote    {} ({} bytes)", ttlFile.getFileName(), Files.size(ttlFile));

        // ── TriG (named graph per file) — use Jena Dataset API ────────────────
        String graphIRI = "urn:graph:" + baseName;
        Dataset dataset = DatasetFactory.create();
        dataset.addNamedModel(graphIRI, model);
        try (OutputStream out = Files.newOutputStream(trigFile)) {
            RDFDataMgr.write(out, dataset, RDFFormat.TRIG_PRETTY);
        }
        log.info("Wrote    {} ({} bytes)", trigFile.getFileName(), Files.size(trigFile));
    }

    private static long countLines(Path file) throws IOException {
        try (var lines = Files.lines(file)) {
            return lines.count();
        }
    }
}
