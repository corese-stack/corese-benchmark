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
import java.nio.charset.StandardCharsets;
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
                safeConvertFile(ntFile);
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
                        safeConvertFile(ntFile);
                    }
                }
            }
        }

        log.info("Conversion completed successfully.");
    }

    private static void safeConvertFile(Path ntFile) {
        try {
            // Guard against massive files (> 2 GB) that would cause Java heap OOM during monolithic in-memory parsing
            long sizeBytes = Files.size(ntFile);
            if (sizeBytes > 1_500_000_000L) { // > 1.5 GB
                log.warn("Skipping multi-format conversion for very large file: {} ({} MB) to protect heap",
                        ntFile.getFileName(), sizeBytes / (1024 * 1024));
                return;
            }
            convertFile(ntFile);
        } catch (OutOfMemoryError oom) {
            log.error("Out of memory converting file: {} — skipping to protect pipeline", ntFile.getFileName());
            System.gc();
        } catch (Exception e) {
            log.error("Failed to convert file {}: {} — skipping", ntFile.getFileName(), e.getMessage());
        }
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
        safeGenerateFile(ttlFile, out -> RDFDataMgr.write(out, model, RDFFormat.TURTLE_PRETTY), "Turtle", ntFile);

        // 2. RDF/XML (.rdf) standard W3C XML representation
        safeGenerateFile(rdfFile, out -> RDFDataMgr.write(out, model, RDFFormat.RDFXML_PLAIN), "RDF/XML", ntFile);

        // 3. JSON-LD (.jsonld) standard Web / Linked Data representation
        safeGenerateFile(jsonldFile, out -> RDFDataMgr.write(out, model, RDFFormat.JSONLD_FLAT), "JSON-LD", ntFile);

        // 4. N-Quads (.nq) with named graph
        String graphIri = "urn:graph:" + baseName;
        Dataset dataset = DatasetFactory.create();
        dataset.addNamedModel(graphIri, model);
        safeGenerateFile(nqFile, out -> RDFDataMgr.write(out, dataset, RDFFormat.NQUADS_UTF8), "N-Quads", ntFile);

        // 5. TriG (.trig) with named graph block
        safeGenerateFile(trigFile, out -> RDFDataMgr.write(out, dataset, RDFFormat.TRIG_PRETTY), "TriG", ntFile);

        // 6. RDFa (.html) XHTML+RDFa 1.1 representation
        Path htmlFile = ntFile.resolveSibling(baseName + ".html");
        safeGenerateFile(htmlFile, out -> {
            try {
                writeRdfaHtml(model, htmlFile, baseName);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }, "RDFa", ntFile);
    }

    @FunctionalInterface
    private interface OutputWriter {
        void write(OutputStream out) throws Exception;
    }

    private static void safeGenerateFile(Path targetFile, OutputWriter writer, String formatName, Path sourceNt) {
        Path tempFile = targetFile.resolveSibling(targetFile.getFileName() + ".tmp");
        try {
            try (OutputStream out = Files.newOutputStream(tempFile)) {
                writer.write(out);
            }
            Files.move(tempFile, targetFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            log.info("  Generated {}: {} ({} bytes)", formatName, targetFile.getFileName(), Files.size(targetFile));
        } catch (Throwable t) {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception ignored) {}
            log.warn("  Could not generate {} for {}: {}", formatName, sourceNt.getFileName(), t.getMessage());
        }
    }

    private static void writeRdfaHtml(Model model, Path htmlFile, String title) throws IOException {
        try (var writer = Files.newBufferedWriter(htmlFile, StandardCharsets.UTF_8)) {
            writer.write("<!DOCTYPE html>\n");
            writer.write("<html xmlns=\"http://www.w3.org/1999/xhtml\" version=\"XHTML+RDFa 1.1\" prefix=\"rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema#\">\n");
            writer.write("<head><title>");
            writer.write(escapeXml(title));
            writer.write("</title></head>\n<body>\n<div>\n");

            var it = model.listStatements();
            while (it.hasNext()) {
                var stmt = it.nextStatement();
                var s = stmt.getSubject();
                var p = stmt.getPredicate();
                var o = stmt.getObject();

                String subjAttr = s.isURIResource() ? " about=\"" + escapeXml(s.getURI()) + "\"" : "";
                String predAttr = " property=\"" + escapeXml(p.getURI()) + "\"";

                writer.write("  <span");
                writer.write(subjAttr);
                writer.write(predAttr);
                if (o.isURIResource()) {
                    writer.write(" resource=\"");
                    writer.write(escapeXml(o.asResource().getURI()));
                    writer.write("\"></span>\n");
                } else if (o.isLiteral()) {
                    var lit = o.asLiteral();
                    String dt = lit.getDatatypeURI();
                    String lang = lit.getLanguage();
                    if (dt != null && !dt.isEmpty()) {
                        writer.write(" datatype=\"");
                        writer.write(escapeXml(dt));
                        writer.write("\"");
                    }
                    if (lang != null && !lang.isEmpty()) {
                        writer.write(" xml:lang=\"");
                        writer.write(escapeXml(lang));
                        writer.write("\"");
                    }
                    writer.write(">");
                    writer.write(escapeXml(lit.getLexicalForm()));
                    writer.write("</span>\n");
                } else {
                    writer.write("></span>\n");
                }
            }
            writer.write("</div>\n</body>\n</html>\n");
        }
    }

    private static String escapeXml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}
