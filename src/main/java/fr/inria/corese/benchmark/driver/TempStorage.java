package fr.inria.corese.benchmark.driver;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * Manages the lifecycle and clean deletion of ephemeral storage directories
 * allocated for persistent disk-backed triple store benchmarks (e.g. Jena TDB2,
 * RDF4J NativeStore, RDF4J LMDB).
 *
 * <p>Supports configuring an explicit base directory via the system property
 * {@code corese.bench.storage.dir}. This prevents disk benchmarks from running on
 * {@code /tmp} (which is frequently mounted as a RAM-backed {@code tmpfs} under Linux,
 * skewing I/O and memory measurements).</p>
 *
 * <p>Registers a single, lazy JVM shutdown hook ensuring that no orphan files or
 * directories leak on disk even upon abnormal process termination.</p>
 */
final class TempStorage {

    private static final Logger log = LoggerFactory.getLogger(TempStorage.class);

    /** System property allowing benchmark operators to target a physical disk or NVMe partition. */
    public static final String STORAGE_DIR_PROPERTY = "corese.bench.storage.dir";

    private static final Set<Path> PENDING = ConcurrentHashMap.newKeySet();
    private static final AtomicBoolean HOOK_REGISTERED = new AtomicBoolean(false);

    private TempStorage() {}

    /**
     * Creates an ephemeral storage directory with the specified prefix.
     * Registers the directory for automated shutdown cleanup.
     *
     * @param prefix directory prefix name (e.g. {@code "corese-bench-jena-tdb2-"})
     * @return the newly created directory path
     * @throws IOException if directory creation fails
     */
    @SuppressWarnings("java:S5443") // Ephemeral directory created with user/owner permissions; cleaned up reliably
    public static Path create(String prefix) throws IOException {
        ensureShutdownHook();

        String customBase = System.getProperty(STORAGE_DIR_PROPERTY);
        Path dir;
        if (customBase != null && !customBase.isBlank()) {
            Path basePath = Path.of(customBase);
            Files.createDirectories(basePath);
            dir = Files.createTempDirectory(basePath, prefix);
        } else {
            dir = Files.createTempDirectory(prefix);
        }

        PENDING.add(dir);
        return dir;
    }

    /**
     * Safely releases and deletes the specified directory.
     * Removes the path from the pending cleanup registry if deletion succeeds.
     *
     * @param path directory path to release
     */
    public static void release(Path path) {
        if (path == null) {
            return;
        }
        if (deleteQuietly(path)) {
            PENDING.remove(path);
        }
    }

    /**
     * Lazily registers a JVM shutdown hook to clean any lingering temporary directories.
     */
    private static void ensureShutdownHook() {
        if (HOOK_REGISTERED.compareAndSet(false, true)) {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                for (Path p : PENDING) {
                    deleteQuietly(p);
                }
            }, "corese-temp-storage-cleanup"));
        }
    }

    /**
     * Deletes a directory tree recursively in reverse order.
     * Tolerates individual file deletion failures and does not abort the stream.
     *
     * @param root root directory to delete
     * @return {@code true} if the directory no longer exists on disk
     */
    static boolean deleteQuietly(Path root) {
        if (root == null || !Files.exists(root)) {
            return true;
        }
        try (Stream<Path> stream = Files.walk(root)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.warn("Could not delete temporary file {}: {}", p, e.getMessage());
                }
            });
            return !Files.exists(root);
        } catch (IOException | UncheckedIOException e) {
            log.warn("Failed to walk temporary storage directory {}: {}", root, e.getMessage());
            return false;
        }
    }

    /** Returns current number of active temporary directories managed by this registry. */
    static int getPendingCount() {
        return PENDING.size();
    }
}
