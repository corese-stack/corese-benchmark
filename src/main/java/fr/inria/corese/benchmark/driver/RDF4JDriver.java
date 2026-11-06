package fr.inria.corese.benchmark.driver;

import fr.inria.corese.benchmark.metrics.MetricsCollector;
import fr.inria.corese.benchmark.validation.SparqlResultHasher;
import org.eclipse.rdf4j.model.Value;
import org.eclipse.rdf4j.query.BindingSet;
import org.eclipse.rdf4j.repository.sail.SailRepository;
import org.eclipse.rdf4j.repository.RepositoryConnection;
import org.eclipse.rdf4j.sail.lmdb.LmdbStore;
import org.eclipse.rdf4j.sail.memory.MemoryStore;
import org.eclipse.rdf4j.sail.nativerdf.NativeStore;
import org.eclipse.rdf4j.query.TupleQuery;
import org.eclipse.rdf4j.query.TupleQueryResult;
import org.eclipse.rdf4j.query.QueryLanguage;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Benchmark driver for Eclipse RDF4J 5.
 *
 * <p>Supports in-memory repositories backed by {@link MemoryStore} as well as persistent
 * disk-backed storage via {@link NativeStore} and {@link LmdbStore}. Storage mode is automatically
 * inferred from the engine name suffix ({@code .native} or {@code .lmdb}) or explicitly configured.</p>
 *
 * <p>Thread safety note: Instances of this driver are single-threaded and operated sequentially
 * during benchmark warmup, load, and query executions.</p>
 *
 * <p>N-Triples files are parsed in batches of 10 000 lines; when a batch fails due to a malformed
 * triple the driver falls back to line-by-line parsing so that valid triples are still loaded.</p>
 */
public class RDF4JDriver implements TripleStoreDriver {

    private static final Logger log = LoggerFactory.getLogger(RDF4JDriver.class);

    /**
     * Storage backend types supported by RDF4J.
     */
    public enum StorageType {
        MEMORY,
        NATIVE,
        LMDB;

        public static StorageType fromEngineName(String engineName) {
            if (engineName == null) {
                return MEMORY;
            }
            String lower = engineName.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".native")) {
                return NATIVE;
            }
            if (lower.endsWith(".lmdb")) {
                return LMDB;
            }
            return MEMORY;
        }
    }

    private final String name;
    private final StorageType storageType;
    private SailRepository repository;
    private Path tempDir;

    /**
     * Constructs a new driver with the given engine name.
     * Storage mode is automatically inferred:
     * <ul>
     *   <li>Ends with {@code ".native"} &rarr; {@link StorageType#NATIVE}</li>
     *   <li>Ends with {@code ".lmdb"} &rarr; {@link StorageType#LMDB}</li>
     *   <li>Otherwise &rarr; {@link StorageType#MEMORY}</li>
     * </ul>
     *
     * @param name human-readable engine name reported in benchmark results (e.g. {@code "rdf4j.5.3.2"}, {@code "rdf4j.5.3.2.native"}, or {@code "rdf4j.5.3.2.lmdb"})
     */
    public RDF4JDriver(String name) {
        this(name, StorageType.fromEngineName(Objects.requireNonNull(name, "Engine name must not be null")));
    }

    /**
     * Constructs a new driver with legacy boolean storage mode.
     *
     * @param name        human-readable engine name
     * @param nativeStore {@code true} to use NativeStore disk storage, {@code false} for in-memory
     */
    public RDF4JDriver(String name, boolean nativeStore) {
        this(name, nativeStore ? StorageType.NATIVE : StorageType.MEMORY);
    }

    /**
     * Constructs a new driver with explicit storage type.
     *
     * @param name        human-readable engine name
     * @param storageType explicit storage backend type
     */
    public RDF4JDriver(String name, StorageType storageType) {
        this.name = Objects.requireNonNull(name, "Engine name must not be null");
        this.storageType = Objects.requireNonNull(storageType, "StorageType must not be null");
    }

    /**
     * Indicates whether this driver uses NativeStore persistent disk storage.
     *
     * @return {@code true} if NativeStore is enabled, {@code false} otherwise
     */
    public boolean isNativeStore() {
        return storageType == StorageType.NATIVE;
    }

    /**
     * Indicates whether this driver uses LMDB persistent disk storage.
     *
     * @return {@code true} if LMDB is enabled, {@code false} otherwise
     */
    public boolean isLmdbStore() {
        return storageType == StorageType.LMDB;
    }

    /**
     * Returns the active storage backend type.
     *
     * @return storage backend type
     */
    public StorageType getStorageType() {
        return storageType;
    }

    /**
     * Initialises a fresh RDF4J {@link SailRepository} (in-memory or disk-backed).
     * If previously initialised, releases existing resources first.
     */
    @Override
    public void init() {
        if (repository != null || tempDir != null) {
            close();
        }
        openStorage();
    }

    private void openStorage() {
        try {
            switch (storageType) {
                case NATIVE -> {
                    this.tempDir = TempStorage.create("corese-bench-rdf4j-native-");
                    this.repository = new SailRepository(new NativeStore(tempDir.toFile()));
                }
                case LMDB -> {
                    this.tempDir = TempStorage.create("corese-bench-rdf4j-lmdb-");
                    this.repository = new SailRepository(new LmdbStore(tempDir.toFile()));
                }
                case MEMORY -> this.repository = new SailRepository(new MemoryStore());
            }
            this.repository.init();
        } catch (Exception e) {
            closeStorage();
            throw new IllegalStateException("Failed to initialise RDF4J repository (" + storageType + ")", e);
        }
    }

    /**
     * Loads an RDF file (.nt, .nq, .ttl, .trig) into the repository.
     * N-Triples files are parsed in batches with line-by-line fallback to tolerate malformed lines.
     * Other formats are parsed via the corresponding RIO parser.
     *
     * @param filePath absolute path to the RDF file to load
     * @throws Exception if the file cannot be opened or parsed
     */
    @Override
    public void load(String filePath) throws Exception {
        BenchmarkFormat benchFormat = BenchmarkFormat.fromFileName(filePath)
            .orElseThrow(() -> new IllegalArgumentException("Unsupported RDF format for file: " + filePath));

        RDFFormat rioFormat = switch (benchFormat) {
            case NTRIPLES -> RDFFormat.NTRIPLES;
            case NQUADS   -> RDFFormat.NQUADS;
            case TURTLE   -> RDFFormat.TURTLE;
            case TRIG     -> RDFFormat.TRIG;
        };

        if (benchFormat == BenchmarkFormat.NTRIPLES) {
            loadNtBatched(filePath);
        } else {
            try (RepositoryConnection conn = repository.getConnection();
                 InputStream in = new BufferedInputStream(new FileInputStream(filePath))) {
                conn.begin();
                conn.add(in, "", rioFormat);
                conn.commit();
            }
        }
    }

    private void loadNtBatched(String filePath) throws Exception {
        // Parse in batches; on failure fall back to line-by-line to skip malformed triples.
        // The NPE from GenericStatement (null IRI) is a RuntimeException and IS catchable.
        try (RepositoryConnection conn = repository.getConnection();
             BufferedReader reader = new BufferedReader(
                     new InputStreamReader(new FileInputStream(filePath), StandardCharsets.UTF_8))) {
            conn.begin();
            StringBuilder batch = new StringBuilder();
            String line;
            int batchLineCount = 0;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                batch.append(trimmed).append('\n');
                batchLineCount++;
                if (batchLineCount >= 10_000) {
                    flushBatch(batch.toString(), conn);
                    batch.setLength(0);
                    batchLineCount = 0;
                }
            }
            if (!batch.isEmpty()) {
                flushBatch(batch.toString(), conn);
            }
            conn.commit();
        }
    }

    /**
     * Attempts to add a block of N-Triples content to the repository in one call.
     * If that fails, falls back to adding each line individually, logging a warning
     * for any line that cannot be parsed.
     *
     * @param content N-Triples text (one or more lines, newline-terminated)
     * @param conn    active repository connection; the caller manages its transaction
     */
    private void flushBatch(String content, RepositoryConnection conn) {
        try {
            conn.add(new StringReader(content), "", RDFFormat.NTRIPLES);
        } catch (Exception batchEx) {
            // Batch contains a malformed triple — fall back to line-by-line
            for (String ln : content.split("\n")) {
                if (ln.trim().isEmpty()) continue;
                try {
                    conn.add(new StringReader(ln + "\n"), "", RDFFormat.NTRIPLES);
                } catch (Exception lineEx) {
                    log.warn("Skipping malformed triple: {}", ln);
                }
            }
        }
    }

    /**
     * Executes a SPARQL SELECT query and fully iterates the result set.
     * Note: only SELECT queries are currently supported by this driver.
     *
     * @param sparql the SPARQL SELECT query string
     * @return execution time in milliseconds
     */
    @Override
    public long query(String sparql) {
        long startNs = System.nanoTime();
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                while (result.hasNext()) result.next();
            }
        }
        return (System.nanoTime() - startNs) / 1_000_000L;
    }

    /**
     * Executes a SPARQL SELECT query and returns full metrics including TTFR and heap delta.
     * RDF4J {@code TupleQueryResult} is a lazy cursor — TTFR is recorded after the first
     * {@code result.next()} call.
     * Validation hash computation is performed separately in {@link #computeResultHash(String)}
     * to eliminate cryptographic hashing distortion from latency measurements.
     */
    @Override
    public QueryMetrics queryWithMetrics(String sparql) {
        long heapBefore = MetricsCollector.usedHeapBytes();
        long startNs = System.nanoTime();
        long ttfrNs = -1L;
        long count = 0;
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                if (result.hasNext()) {
                    result.next();
                    count++;
                    ttfrNs = System.nanoTime() - startNs;
                    while (result.hasNext()) {
                        result.next();
                        count++;
                    }
                } else {
                    ttfrNs = System.nanoTime() - startNs;
                }
            }
        }
        long totalNs = System.nanoTime() - startNs;
        if (ttfrNs < 0) ttfrNs = totalNs;
        double totalMs = totalNs / 1_000_000.0;
        double ttfrMs = ttfrNs / 1_000_000.0;
        return new QueryMetrics(totalMs, ttfrMs, count, MetricsCollector.usedHeapBytes() - heapBefore, "");
    }

    @Override
    public ValidationResult validateResult(String sparql) {
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                List<String> bindingNames = new ArrayList<>(result.getBindingNames());
                java.util.Collections.sort(bindingNames);
                SparqlResultHasher hasher = new SparqlResultHasher();
                while (result.hasNext()) {
                    BindingSet bs = result.next();
                    addRdf4jRow(hasher, bs, bindingNames);
                }
                return new ValidationResult(hasher.computeHash(), hasher.hasBlankNodes());
            }
        } catch (Exception e) {
            log.error("Error computing RDF4J result hash: {}", e.getMessage(), e);
            throw new IllegalStateException("RDF4J validation failed: " + e.getMessage(), e);
        }
    }

    @Override
    public String computeResultHash(String sparql) {
        return validateResult(sparql).hash();
    }

    private static void addRdf4jRow(SparqlResultHasher hasher, BindingSet bs, List<String> bindingNames) {
        List<String> values = new ArrayList<>(bindingNames.size());
        for (String name : bindingNames) {
            Value val = bs.getValue(name);
            if (val == null) {
                values.add(null);
            } else if (val instanceof org.eclipse.rdf4j.model.BNode) {
                values.add("_:" + val.stringValue());
            } else {
                values.add(val.stringValue());
            }
        }
        hasher.addRow(values);
    }

    /** Executes a SPARQL SELECT query and returns {@code [timeMs, resultCount]}. */
    @Override
    public long[] queryWithCount(String sparql) {
        long startNs = System.nanoTime();
        long count = 0;
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery q = conn.prepareTupleQuery(QueryLanguage.SPARQL, sparql);
            try (TupleQueryResult result = q.evaluate()) {
                while (result.hasNext()) { result.next(); count++; }
            }
        }
        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000L;
        return new long[]{ elapsedMs, count };
    }

    /**
     * Returns the total number of statements held in the repository.
     *
     * @return triple count
     */
    @Override
    public long getGraphSize() {
        try (RepositoryConnection conn = repository.getConnection()) {
            return conn.size();
        }
    }

    /**
     * Resets the repository by shutting it down and reinitialising a fresh repository.
     * For in-memory, re-creates a MemoryStore.
     * For NativeStore, safely shuts down the repository, deletes the temporary directory, and creates a fresh NativeStore.
     */
    @Override
    public void clear() {
        if (repository != null) {
            closeStorage();
            openStorage();
        }
    }

    /**
     * Shuts down the repository and releases all resources.
     * If NativeStore is enabled, deletes the temporary directory.
     * Safe to call even if {@link #init()} was never called.
     */
    @Override
    public void close() {
        closeStorage();
    }

    private void closeStorage() {
        try {
            if (repository != null) {
                try {
                    repository.shutDown();
                } catch (Exception e) {
                    log.warn("Error shutting down RDF4J repository", e);
                }
            }
        } finally {
            this.repository = null;
            if (tempDir != null) {
                TempStorage.release(tempDir);
                this.tempDir = null;
            }
        }
    }

    @Override
    public String getName() {
        return name;
    }
}
