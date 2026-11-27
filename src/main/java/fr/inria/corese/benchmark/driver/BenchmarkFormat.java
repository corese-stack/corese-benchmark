package fr.inria.corese.benchmark.driver;

import java.io.File;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Supported RDF serialization formats in the benchmark harness.
 */
public enum BenchmarkFormat {
    NTRIPLES("nt", false),
    NQUADS("nq", true),
    TURTLE("ttl", false),
    TRIG("trig", true),
    RDFXML("rdf", false),
    JSONLD("jsonld", true),
    RDFA("html", false);

    private final String extension;
    private final boolean supportsNamedGraphs;

    BenchmarkFormat(String extension, boolean supportsNamedGraphs) {
        this.extension = extension;
        this.supportsNamedGraphs = supportsNamedGraphs;
    }

    public String getExtension() {
        return extension;
    }

    public boolean supportsNamedGraphs() {
        return supportsNamedGraphs;
    }

    /** Resolves a canonical dataset extension or standard serialization alias. */
    public static BenchmarkFormat fromToken(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Dataset format must not be empty");
        }
        String normalized = token.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith(".")) normalized = normalized.substring(1);
        return switch (normalized) {
            case "nt", "ntriples" -> NTRIPLES;
            case "nq", "nquads" -> NQUADS;
            case "ttl", "turtle" -> TURTLE;
            case "trig" -> TRIG;
            case "rdf", "rdfxml", "rdf/xml" -> RDFXML;
            case "jsonld", "json-ld" -> JSONLD;
            default -> throw new IllegalArgumentException("Unknown dataset format '" + token
                    + "'; expected nt, nq, ttl, trig, rdf or jsonld");
        };
    }

    /** Parses a CSV filter; an empty filter selects all canonical dataset formats. */
    public static Set<BenchmarkFormat> parseFormatList(String csv) {
        if (csv == null || csv.isBlank()) return Set.of();
        EnumSet<BenchmarkFormat> formats = EnumSet.noneOf(BenchmarkFormat.class);
        for (String token : csv.split(",", -1)) formats.add(fromToken(token));
        return Collections.unmodifiableSet(formats);
    }

    /**
     * Whether a file uses one of the six canonical dataset extensions.
     * RDFa documents and aliases such as .xml remain recognizable by drivers,
     * but are excluded from automatic benchmark discovery.
     *
     * @param file candidate dataset file
     * @return true for .nt, .nq, .ttl, .trig, .rdf or .jsonld (case-insensitive)
     */
    public static boolean isCanonicalFile(File file) {
        if (file == null) {
            return false;
        }
        String lower = file.getName().toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(format -> format != RDFA)
                .anyMatch(format -> lower.endsWith("." + format.extension));
    }

    /**
     * Resolves the format from a file name extension (case-insensitive).
     *
     * @param fileName file name or path string
     * @return matching format or empty
     */
    public static Optional<BenchmarkFormat> fromFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return Optional.empty();
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(f -> lower.endsWith("." + f.extension)
                        || (f == RDFXML && lower.endsWith(".xml"))
                        || (f == RDFA && (lower.endsWith(".xhtml") || lower.endsWith(".htm"))))
                .findFirst();
    }

    /**
     * Resolves the format from a {@link Path}.
     *
     * @param path file path
     * @return matching format or empty
     */
    public static Optional<BenchmarkFormat> fromPath(Path path) {
        if (path == null || path.getFileName() == null) {
            return Optional.empty();
        }
        return fromFileName(path.getFileName().toString());
    }

    /**
     * Resolves the format from a {@link File}.
     *
     * @param file file object
     * @return matching format or empty
     */
    public static Optional<BenchmarkFormat> fromFile(File file) {
        if (file == null) {
            return Optional.empty();
        }
        return fromFileName(file.getName());
    }
}
