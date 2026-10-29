package fr.inria.corese.benchmark.validation;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Computes a deterministic SHA-256 fingerprint of a SPARQL solution sequence.
 *
 * <ul>
 *   <li><b>ordered</b> (ORDER BY queries): rows are streamed into the digest as received;</li>
 *   <li><b>unordered</b>: rows are buffered and sorted lexicographically (unsigned bytes)
 *       before hashing, so the result is independent of engine row order.</li>
 * </ul>
 *
 * <p>Each row is encoded as a value count followed by length-prefixed UTF-8 values;
 * unbound (null) values use length -1, so ["ab", null] never collides with ["a", "b"].
 * Only values are hashed; {@link #addRow(Map)} orders them by variable name.
 *
 * <p>Not thread-safe.
 */
public final class SparqlResultHasher {

    private static final String ALGORITHM = "SHA-256";
    private static final int NULL_MARKER = -1;

    private final boolean ordered;
    private final MessageDigest streamingDigest;
    private final List<byte[]> bufferedRows = new ArrayList<>();
    private long rowCount;

    /** Unordered mode: rows are sorted before hashing. */
    public SparqlResultHasher() {
        this(false);
    }

    /** @param ordered true if rows already arrive in a deterministic order (streaming mode) */
    public SparqlResultHasher(boolean ordered) {
        this.ordered = ordered;
        this.streamingDigest = ordered ? newDigest() : null;
    }

    /** Adds a binding; values are taken in ascending variable-name order. Null map/values = unbound. */
    public SparqlResultHasher addRow(Map<String, String> binding) {
        if (binding == null) {
            return addRow(List.of());
        }
        Map<String, String> sorted = new TreeMap<>();
        binding.forEach((name, value) -> sorted.put(Objects.requireNonNull(name, "variable name"), value));
        return addRow(new ArrayList<>(sorted.values()));
    }

    /** Adds a row whose values are already ordered by variable name; null elements are unbound. */
    public SparqlResultHasher addRow(List<String> values) {
        byte[] encoded = encode(values == null ? List.of() : values);
        if (ordered) {
            streamingDigest.update(encoded);
        } else {
            bufferedRows.add(encoded);
        }
        rowCount++;
        return this;
    }

    public long getRowCount() {
        return rowCount;
    }

    /** Lowercase hex SHA-256 of the rows so far; repeatable, rows may be added afterwards. */
    public String computeHash() {
        MessageDigest digest = ordered ? cloneStreamingDigest() : hashSortedRows();
        return HexFormat.of().formatHex(digest.digest());
    }

    private MessageDigest hashSortedRows() {
        List<byte[]> sorted = new ArrayList<>(bufferedRows);
        sorted.sort(Arrays::compareUnsigned);
        MessageDigest digest = newDigest();
        sorted.forEach(digest::update);
        return digest;
    }

    private MessageDigest cloneStreamingDigest() {
        try {
            return (MessageDigest) streamingDigest.clone();
        } catch (CloneNotSupportedException e) {
            throw new IllegalStateException(ALGORITHM + " digest is not cloneable", e);
        }
    }

    private static byte[] encode(List<String> values) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeInt(out, values.size());
        for (String value : values) {
            writeValue(out, value);
        }
        return out.toByteArray();
    }

    private static void writeValue(ByteArrayOutputStream out, String value) {
        if (value == null) {
            writeInt(out, NULL_MARKER);
            return;
        }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeInt(out, bytes.length);
        out.writeBytes(bytes);
    }

    private static void writeInt(ByteArrayOutputStream out, int v) {
        out.write(v >>> 24);
        out.write(v >>> 16);
        out.write(v >>> 8);
        out.write(v);
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance(ALGORITHM);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(ALGORITHM + " is required by the Java platform", e);
        }
    }
}
