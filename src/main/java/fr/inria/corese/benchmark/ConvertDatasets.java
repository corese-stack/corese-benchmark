package fr.inria.corese.benchmark;

import fr.inria.corese.benchmark.driver.BenchmarkFormat;
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
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Converts canonical N-Triples datasets, optionally selecting output formats with {@code --formats}.
 *
 * <p>Run via: {@code ./gradlew convertDatasets}
 */
public class ConvertDatasets {

    private static final Logger log = LoggerFactory.getLogger(ConvertDatasets.class);

    public static void main(String[] args) throws IOException {
        List<String> paths = new ArrayList<>();
        Set<BenchmarkFormat> targetFormats = EnumSet.allOf(BenchmarkFormat.class);
        int i = 0;
        while (i < args.length) {
            String arg = args[i];
            if (arg.startsWith("--formats=")) {
                targetFormats = BenchmarkFormat.parseFormatList(arg.substring("--formats=".length()));
                i++;
            } else if ("--formats".equals(arg)) {
                if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
                    throw new IllegalArgumentException("Missing value for --formats");
                }
                targetFormats = BenchmarkFormat.parseFormatList(args[i + 1]);
                i += 2;
            } else {
                paths.add(arg);
                i++;
            }
        }
        if (paths.isEmpty()) {
            convertDefaultTargetFiles(targetFormats);
        } else {
            convertTargetPaths(paths, targetFormats);
        }
        log.info("Conversion completed successfully.");
    }

    private static void convertDefaultTargetFiles(Set<BenchmarkFormat> targetFormats) {
        List<Path> targetFiles = List.of(
                Path.of("input/lubm/unzip/lubm_medium.nt"),
                Path.of("input/dbpedia/unzip/persondata_en.nt"),
                Path.of("input/bowlogna/unzip/Department0.nt")
        );

        for (Path ntFile : targetFiles) {
            if (!Files.exists(ntFile)) {
                log.warn("Skipping file (not found): {}", ntFile);
                continue;
            }
            safeConvertFile(ntFile, targetFormats);
        }
    }

    private static void convertTargetPaths(List<String> args, Set<BenchmarkFormat> targetFormats) throws IOException {
        for (String arg : args) {
            Path targetPath = Path.of(arg);
            if (!Files.exists(targetPath)) {
                log.warn("Path does not exist: {}", targetPath);
                continue;
            }
            if (Files.isRegularFile(targetPath) && targetPath.getFileName().toString().endsWith(".nt")) {
                safeConvertFile(targetPath, targetFormats);
            } else if (Files.isDirectory(targetPath)) {
                convertDirectory(targetPath, targetFormats);
            }
        }
    }

    private static void convertDirectory(Path directory, Set<BenchmarkFormat> targetFormats) throws IOException {
        try (var stream = Files.list(directory)) {
            List<Path> ntFiles = stream
                    .filter(p -> p.getFileName().toString().endsWith(".nt"))
                    .sorted()
                    .toList();

            for (Path ntFile : ntFiles) {
                safeConvertFile(ntFile, targetFormats);
            }
        }
    }

    private static void safeConvertFile(Path ntFile, Set<BenchmarkFormat> targetFormats) {
        try {
            // Guard against massive files (> 2 GB) that would cause Java heap OOM during monolithic in-memory parsing
            long sizeBytes = Files.size(ntFile);
            if (sizeBytes > 1_500_000_000L) { // > 1.5 GB
                log.warn("Skipping multi-format conversion for very large file: {} ({} MB) to protect heap",
                        ntFile.getFileName(), sizeBytes / (1024 * 1024));
                return;
            }
            convertFile(ntFile, targetFormats);
        } catch (OutOfMemoryError oom) {
            log.error("Out of memory converting file: {} — aborting conversion", ntFile.getFileName(), oom);
            throw new IllegalStateException("OOM converting " + ntFile.getFileName(), oom);
        } catch (Exception e) {
            log.error("Failed to convert file {}: {}", ntFile.getFileName(), e.getMessage(), e);
            throw new IllegalStateException("Failed to convert " + ntFile.getFileName(), e);
        }
    }

    public static void convertFile(Path ntFile) {
        convertFile(ntFile, EnumSet.allOf(BenchmarkFormat.class));
    }

    /** Reads the source once and writes only the requested serializations. */
    private static void convertFile(Path ntFile, Set<BenchmarkFormat> targetFormats) {
        Set<BenchmarkFormat> effectiveFormats = targetFormats.isEmpty()
                ? EnumSet.allOf(BenchmarkFormat.class)
                : targetFormats;
        if (effectiveFormats.equals(Set.of(BenchmarkFormat.NTRIPLES))) {
            log.info("No derived formats requested; keeping N-Triples source: {}", ntFile);
            return;
        }
        String baseName = ntFile.getFileName().toString().replaceFirst("\\.nt$", "");
        log.info("Reading canonical N-Triples: {} ...", ntFile);
        Model model = ModelFactory.createDefaultModel();
        Dataset dataset = null;
        try {
            RDFDataMgr.read(model, ntFile.toAbsolutePath().toString(), Lang.NTRIPLES);
            log.info("  Parsed {} triples from {}", model.size(), ntFile.getFileName());
            if (effectiveFormats.contains(BenchmarkFormat.NQUADS) || effectiveFormats.contains(BenchmarkFormat.TRIG)) {
                dataset = DatasetFactory.create();
                dataset.addNamedModel("urn:graph:" + baseName, model);
            }
            for (BenchmarkFormat format : effectiveFormats) {
                generateFormat(ntFile, baseName, model, dataset, format);
            }
        } finally {
            if (dataset != null) dataset.close();
            model.close();
        }
    }

    private static void generateFormat(Path source, String baseName, Model model, Dataset dataset,
                                       BenchmarkFormat format) {
        if (format == BenchmarkFormat.NTRIPLES) return;
        Path target = source.resolveSibling(baseName + "." + format.getExtension());
        safeGenerateFile(target, out -> {
            switch (format) {
                case TURTLE -> RDFDataMgr.write(out, model, RDFFormat.TURTLE_PRETTY);
                case RDFXML -> RDFDataMgr.write(out, model, RDFFormat.RDFXML_PLAIN);
                case JSONLD -> RDFDataMgr.write(out, model, RDFFormat.JSONLD_FLAT);
                case NQUADS -> RDFDataMgr.write(out, dataset, RDFFormat.NQUADS_UTF8);
                case TRIG -> RDFDataMgr.write(out, dataset, RDFFormat.TRIG_PRETTY);
                case RDFA -> writeRdfaHtml(model, out, baseName);
                default -> throw new IllegalArgumentException("Unsupported output format: " + format);
            }
        }, format.name(), source);
    }

    @FunctionalInterface
    private interface OutputWriter {
        void write(OutputStream out) throws IOException;
    }

    private static void safeGenerateFile(Path targetFile, OutputWriter writer, String formatName, Path sourceNt) {
        Path tempFile = targetFile.resolveSibling(targetFile.getFileName() + ".tmp");
        try {
            try (OutputStream out = Files.newOutputStream(tempFile)) {
                writer.write(out);
            }
            Files.move(tempFile, targetFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            log.info("  Generated {}: {} ({} bytes)", formatName, targetFile.getFileName(), Files.size(targetFile));
        } catch (Exception t) {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception e) {
                log.debug("Failed to delete temp file {}: {}", tempFile, e.getMessage());
            }
            log.warn("  Skipping format {} for {} (format serialization constraint or unsupported IRI: {})",
                    formatName, sourceNt.getFileName(), t.getMessage());
        }
    }

    private static void writeRdfaHtml(Model model, OutputStream out, String title) throws IOException {
        var writer = new java.io.BufferedWriter(new java.io.OutputStreamWriter(out, StandardCharsets.UTF_8));
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
        writer.flush();
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
