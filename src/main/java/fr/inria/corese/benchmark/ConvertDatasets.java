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
 * Converts canonical N-Triples benchmark datasets to Turtle (.ttl), N-Quads (.nq) and TriG (.trig)
 * so they can be ingested across all 4 supported W3C formats in the benchmark suite.
 *
 * <p>Run via: {@code ./gradlew convertDatasets}
 */
public class ConvertDatasets {

    private static final Logger log = LoggerFactory.getLogger(ConvertDatasets.class);

    public static void main(String[] args) throws IOException {
        if (args.length == 0) {
            // Default target files if no directories are supplied
            List<Path> targetFiles = List.of(
                    Path.of("input/bsbm/unzip/bsbm_small.nt"),
                    Path.of("input/bsbm/unzip/bsbm_medium.nt"),
                    Path.of("input/lubm/unzip/lubm_small.nt"),
                    Path.of("input/lubm/unzip/lubm_medium.nt"),
                    Path.of("input/dbpedia/unzip/persondata_en.nt")
            );

            for (Path ntFile : targetFiles) {
                if (!Files.exists(ntFile)) {
                    log.warn("Skipping file (not found): {}", ntFile);
                    continue;
                }
                convertFile(ntFile);
            }
        } else {
            for (String arg : args) {
                Path directory = Path.of(arg);
                if (!Files.exists(directory)) {
                    log.warn("Directory does not exist: {}", directory);
                    continue;
                }
                try (var stream = Files.list(directory)) {
                    List<Path> ntFiles = stream
                            .filter(p -> p.getFileName().toString().endsWith(".nt"))
                            .sorted()
                            .toList();

                    for (Path ntFile : ntFiles) {
                        convertFile(ntFile);
                    }
                }
            }
        }

        log.info("Conversion completed successfully.");
    }

    public static void convertFile(Path ntFile) throws IOException {
        String baseName = ntFile.getFileName().toString().replaceFirst("\\.nt$", "");
        Path ttlFile  = ntFile.resolveSibling(baseName + ".ttl");
        Path nqFile   = ntFile.resolveSibling(baseName + ".nq");
        Path trigFile = ntFile.resolveSibling(baseName + ".trig");
        Path rdfFile  = ntFile.resolveSibling(baseName + ".rdf");
        Path jsonldFile = ntFile.resolveSibling(baseName + ".jsonld");

        log.info("Reading canonical N-Triples: {} ...", ntFile);

        Model model = ModelFactory.createDefaultModel();
        RDFDataMgr.read(model, ntFile.toAbsolutePath().toString(), Lang.NTRIPLES);
        long tripleCount = model.size();
        log.info("  Parsed {} triples from {}", tripleCount, ntFile.getFileName());

        // 1. Turtle (.ttl) with subject grouping & prefixes
        try (OutputStream out = Files.newOutputStream(ttlFile)) {
            RDFDataMgr.write(out, model, RDFFormat.TURTLE_PRETTY);
        }
        log.info("  Generated Turtle: {} ({} bytes)", ttlFile.getFileName(), Files.size(ttlFile));

        // 2. RDF/XML (.rdf) standard W3C XML representation
        try (OutputStream out = Files.newOutputStream(rdfFile)) {
            RDFDataMgr.write(out, model, RDFFormat.RDFXML_PLAIN);
        }
        log.info("  Generated RDF/XML: {} ({} bytes)", rdfFile.getFileName(), Files.size(rdfFile));

        // 3. JSON-LD (.jsonld) standard Web / Linked Data representation
        try (OutputStream out = Files.newOutputStream(jsonldFile)) {
            RDFDataMgr.write(out, model, RDFFormat.JSONLD_FLAT);
        }
        log.info("  Generated JSON-LD: {} ({} bytes)", jsonldFile.getFileName(), Files.size(jsonldFile));

        // 4. N-Quads (.nq) with named graph
        String graphIri = "urn:graph:" + baseName;
        Dataset dataset = DatasetFactory.create();
        dataset.addNamedModel(graphIri, model);

        try (OutputStream out = Files.newOutputStream(nqFile)) {
            RDFDataMgr.write(out, dataset, RDFFormat.NQUADS_UTF8);
        }
        log.info("  Generated N-Quads: {} ({} bytes)", nqFile.getFileName(), Files.size(nqFile));

        // 5. TriG (.trig) with named graph block
        try (OutputStream out = Files.newOutputStream(trigFile)) {
            RDFDataMgr.write(out, dataset, RDFFormat.TRIG_PRETTY);
        }
        log.info("  Generated TriG: {} ({} bytes)", trigFile.getFileName(), Files.size(trigFile));
    }
}
