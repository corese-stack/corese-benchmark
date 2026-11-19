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
 * Converts existing N-Triples benchmark datasets to N-Quads, Turtle and TriG formats
 * so they can be used for multi-format ingestion benchmarks.
 *
 * <p>For each .nt file, produces:
 * <ul>
 *   <li>{@code .nq}  – N-Quads with the triples inside a named graph
 *       ({@code <urn:graph:<filename>>})</li>
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
                Path.of("input/lubm/unzip"),
                Path.of("input/bsbm/unzip"),
                Path.of("input/dbpedia/unzip")
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
        Path nqFile   = ntFile.resolveSibling(baseName + ".nq");
        Path ttlFile  = ntFile.resolveSibling(baseName + ".ttl");
        Path trigFile = ntFile.resolveSibling(baseName + ".trig");

        log.info("Reading  {} ({} lines) ...", ntFile.getFileName(), countLines(ntFile));

        Model model = ModelFactory.createDefaultModel();
        RDFDataMgr.read(model, ntFile.toAbsolutePath().toString(), Lang.NTRIPLES);

        // ── N-Quads (named graph per file) ────────────────────────────────────
        String graphIRI = "urn:graph:" + baseName;
        Dataset dataset = DatasetFactory.create();
        dataset.addNamedModel(graphIRI, model);
        try (OutputStream out = Files.newOutputStream(nqFile)) {
            RDFDataMgr.write(out, dataset, RDFFormat.NQUADS);
        }
        log.info("Wrote    {} ({} bytes)", nqFile.getFileName(), Files.size(nqFile));

        // ── Turtle ────────────────────────────────────────────────────────────
        try (OutputStream out = Files.newOutputStream(ttlFile)) {
            RDFDataMgr.write(out, model, RDFFormat.TURTLE_PRETTY);
        }
        log.info("Wrote    {} ({} bytes)", ttlFile.getFileName(), Files.size(ttlFile));

        // ── TriG (named graph per file) ───────────────────────────────────────
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
