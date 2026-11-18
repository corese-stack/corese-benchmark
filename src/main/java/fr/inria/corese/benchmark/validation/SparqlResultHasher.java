package fr.inria.corese.benchmark.validation;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Computes a deterministic SHA-256 fingerprint of a SPARQL solution sequence
 * strictly following W3C SPARQL 1.1 Query Results canonical semantics.
 *
 * <p>Supports:
 * <ul>
 *   <li>{@link ResultOrder#SEQUENCE}: streaming order preserved.</li>
 *   <li>{@link ResultOrder#MULTISET}: rows are canonicalized & sorted lexicographically,
 *       preserving multiplicity (duplicates).</li>
 * </ul>
 */
public final class SparqlResultHasher {

    public enum ResultOrder {
        MULTISET,
        SEQUENCE
    }

    private static final String ALGORITHM = "SHA-256";
    private static final byte TAG_UNBOUND = 0x00;
    private static final byte TAG_IRI = 0x01;
    private static final byte TAG_BLANK = 0x02;
    private static final byte TAG_STRING = 0x03;
    private static final byte TAG_LANG = 0x04;
    private static final byte TAG_TYPED = 0x05;

    private final List<String> projectedVariables;
    private final ResultOrder order;
    private final List<Map<String, BindingTerm>> bufferedRows = new ArrayList<>();
    private boolean hasBlankNodes;
    private long rowCount;

    public SparqlResultHasher() {
        this(List.of(), ResultOrder.MULTISET);
    }

    public SparqlResultHasher(boolean ordered) {
        this(List.of(), ordered ? ResultOrder.SEQUENCE : ResultOrder.MULTISET);
    }

    public SparqlResultHasher(List<String> projectedVariables, ResultOrder order) {
        Objects.requireNonNull(projectedVariables, "projectedVariables cannot be null");
        this.order = Objects.requireNonNull(order, "order cannot be null");
        List<String> sorted = new ArrayList<>(projectedVariables);
        Collections.sort(sorted);
        this.projectedVariables = Collections.unmodifiableList(sorted);
    }

    /** Legacy helper for backward-compatibility with untyped string maps. */
    public SparqlResultHasher addRow(Map<String, String> binding) {
        if (binding == null) {
            return addTypedRow(Map.of());
        }
        Map<String, BindingTerm> typed = new HashMap<>(binding.size());
        binding.forEach((k, v) -> {
            if (v == null) {
                typed.put(k, BindingTerm.Unbound.INSTANCE);
            } else if (v.startsWith("_:")) {
                typed.put(k, BindingTerm.fromBlank(v.substring(2)));
            } else if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("urn:")) {
                typed.put(k, BindingTerm.fromIri(v));
            } else {
                typed.put(k, BindingTerm.fromLiteral(v, null, null));
            }
        });
        return addTypedRow(typed);
    }

    /** Legacy helper for untyped list of strings. */
    public SparqlResultHasher addRow(List<String> values) {
        Map<String, BindingTerm> row = new HashMap<>();
        if (values != null) {
            for (int i = 0; i < values.size(); i++) {
                String val = values.get(i);
                String varName = i < projectedVariables.size() ? projectedVariables.get(i) : String.format("v%04d", i);
                if (val == null) {
                    row.put(varName, BindingTerm.Unbound.INSTANCE);
                } else if (val.startsWith("_:")) {
                    row.put(varName, BindingTerm.fromBlank(val.substring(2)));
                } else if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("urn:")) {
                    row.put(varName, BindingTerm.fromIri(val));
                } else {
                    row.put(varName, BindingTerm.fromLiteral(val, null, null));
                }
            }
        }
        return addTypedRow(row);
    }

    /** Adds a typed row mapping variable names to {@link BindingTerm}. */
    public SparqlResultHasher addTypedRow(Map<String, BindingTerm> row) {
        Map<String, BindingTerm> sanitized = new HashMap<>();
        if (row != null) {
            row.forEach((k, term) -> {
                if (term instanceof BindingTerm.Blank) {
                    hasBlankNodes = true;
                }
                sanitized.put(k, term == null ? BindingTerm.Unbound.INSTANCE : term);
            });
        }
        bufferedRows.add(sanitized);
        rowCount++;
        return this;
    }

    public long getRowCount() {
        return rowCount;
    }

    public boolean hasBlankNodes() {
        return hasBlankNodes;
    }

    /** Computes a deterministic SHA-256 fingerprint. */
    public String computeHash() {
        List<String> effectiveVars = new ArrayList<>(projectedVariables);
        if (effectiveVars.isEmpty()) {
            for (Map<String, BindingTerm> row : bufferedRows) {
                for (String k : row.keySet()) {
                    if (!effectiveVars.contains(k)) {
                        effectiveVars.add(k);
                    }
                }
            }
            Collections.sort(effectiveVars);
        }

        // Canonical blank node mapping computed per-call to be purely deterministic
        Map<String, Integer> bnodeMap = new HashMap<>();
        int[] nextBnodeId = new int[]{0};

        List<byte[]> encodedRows = new ArrayList<>(bufferedRows.size());
        for (Map<String, BindingTerm> row : bufferedRows) {
            encodedRows.add(encodeRow(row, effectiveVars, bnodeMap, nextBnodeId));
        }

        if (order == ResultOrder.MULTISET) {
            encodedRows.sort(Arrays::compareUnsigned);
        }

        MessageDigest digest = newDigest();
        writeString(digest, "SPARQL-RESULT-v2");
        digest.update((byte) (order == ResultOrder.SEQUENCE ? 1 : 0));
        writeInt(digest, effectiveVars.size());
        for (String varName : effectiveVars) {
            writeString(digest, varName);
        }
        writeLong(digest, rowCount);
        for (byte[] rowBytes : encodedRows) {
            digest.update(rowBytes);
        }

        return HexFormat.of().formatHex(digest.digest());
    }

    private byte[] encodeRow(Map<String, BindingTerm> row, List<String> vars, Map<String, Integer> bnodeMap, int[] nextBnodeId) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeInt(out, vars.size());
        for (String varName : vars) {
            BindingTerm term = row.getOrDefault(varName, BindingTerm.Unbound.INSTANCE);
            encodeTerm(out, term, bnodeMap, nextBnodeId);
        }
        return out.toByteArray();
    }

    private void encodeTerm(ByteArrayOutputStream out, BindingTerm term, Map<String, Integer> bnodeMap, int[] nextBnodeId) {
        switch (term) {
            case BindingTerm.Unbound ignored -> out.write(TAG_UNBOUND);
            case BindingTerm.Iri iri -> {
                out.write(TAG_IRI);
                writeString(out, iri.uri());
            }
            case BindingTerm.Blank blank -> {
                out.write(TAG_BLANK);
                int canonId = bnodeMap.computeIfAbsent(blank.localId(), k -> nextBnodeId[0]++);
                writeInt(out, canonId);
            }
            case BindingTerm.PlainString str -> {
                out.write(TAG_STRING);
                writeString(out, str.lexical());
            }
            case BindingTerm.LangString lang -> {
                out.write(TAG_LANG);
                writeString(out, lang.lexical());
                writeString(out, lang.lang());
            }
            case BindingTerm.TypedLiteral typed -> {
                out.write(TAG_TYPED);
                writeString(out, typed.lexical());
                writeString(out, typed.datatypeUri());
            }
        }
    }

    private static void writeString(ByteArrayOutputStream out, String s) {
        if (s == null) {
            writeInt(out, -1);
            return;
        }
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        writeInt(out, bytes.length);
        out.writeBytes(bytes);
    }

    private static void writeString(MessageDigest md, String s) {
        if (s == null) {
            writeInt(md, -1);
            return;
        }
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        writeInt(md, bytes.length);
        md.update(bytes);
    }

    private static void writeInt(ByteArrayOutputStream out, int v) {
        out.write(v >>> 24);
        out.write(v >>> 16);
        out.write(v >>> 8);
        out.write(v);
    }

    private static void writeInt(MessageDigest md, int v) {
        md.update((byte) (v >>> 24));
        md.update((byte) (v >>> 16));
        md.update((byte) (v >>> 8));
        md.update((byte) v);
    }

    private static void writeLong(MessageDigest md, long v) {
        md.update((byte) (v >>> 56));
        md.update((byte) (v >>> 48));
        md.update((byte) (v >>> 40));
        md.update((byte) (v >>> 32));
        md.update((byte) (v >>> 24));
        md.update((byte) (v >>> 16));
        md.update((byte) (v >>> 8));
        md.update((byte) v);
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance(ALGORITHM);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(ALGORITHM + " is required by the Java platform", e);
        }
    }
}
