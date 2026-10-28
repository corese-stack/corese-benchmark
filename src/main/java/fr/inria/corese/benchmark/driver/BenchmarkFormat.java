package fr.inria.corese.benchmark.driver;

import java.io.File;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * Supported RDF serialization formats in the benchmark harness.
 */
public enum BenchmarkFormat {
    NTRIPLES("nt", false),
    NQUADS("nq", true),
    TURTLE("ttl", false),
    TRIG("trig", true);

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
                .filter(f -> lower.endsWith("." + f.extension))
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
