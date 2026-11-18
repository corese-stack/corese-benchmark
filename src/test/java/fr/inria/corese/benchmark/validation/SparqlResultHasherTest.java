package fr.inria.corese.benchmark.validation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SparqlResultHasherTest {

    @Test
    @DisplayName("Unordered mode produces identical hash regardless of row insertion order")
    void unorderedModeIsOrderIndependent() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x", "y"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromIri("http://example.org/1"), "y", BindingTerm.fromLiteral("42", null, null)));
        h1.addTypedRow(Map.of("x", BindingTerm.fromIri("http://example.org/2"), "y", BindingTerm.fromLiteral("99", null, null)));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x", "y"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromIri("http://example.org/2"), "y", BindingTerm.fromLiteral("99", null, null)));
        h2.addTypedRow(Map.of("x", BindingTerm.fromIri("http://example.org/1"), "y", BindingTerm.fromLiteral("42", null, null)));

        assertEquals(2, h1.getRowCount());
        assertEquals(2, h2.getRowCount());
        assertEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Ordered mode distinguishes different row orderings")
    void orderedModeIsOrderSensitive() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.SEQUENCE);
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("A", null, null)));
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("B", null, null)));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.SEQUENCE);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("B", null, null)));
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("A", null, null)));

        assertEquals(2, h1.getRowCount());
        assertEquals(2, h2.getRowCount());
        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("IRI and string with same lexical value do not collide")
    void iriAndStringDoNotCollide() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromIri("http://example.org/x")));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("http://example.org/x", null, null)));

        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Numeric strings '01' and '1' are strictly preserved and do not collide")
    void numericStringsDoNotCollide() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("01", null, null)));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("1", null, null)));

        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Language tags are case-insensitively equal (@FR == @fr)")
    void languageTagsAreNormalized() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("bonjour", "FR", null)));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("bonjour", "fr", null)));

        assertEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("String containing @ does not collide with lang tag")
    void stringContainingAtDoesNotCollide() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("chat@fr", null, null)));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("chat", "fr", null)));

        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Unbound values do not collide with adjacent non-null strings")
    void unboundDoesNotCollide() {
        SparqlResultHasher h1 = new SparqlResultHasher(List.of("x", "y"), SparqlResultHasher.ResultOrder.MULTISET);
        h1.addTypedRow(Map.of("x", BindingTerm.fromLiteral("ab", null, null), "y", BindingTerm.Unbound.INSTANCE));

        SparqlResultHasher h2 = new SparqlResultHasher(List.of("x", "y"), SparqlResultHasher.ResultOrder.MULTISET);
        h2.addTypedRow(Map.of("x", BindingTerm.fromLiteral("a", null, null), "y", BindingTerm.fromLiteral("b", null, null)));

        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Empty result set produces consistent 64-char hex hash")
    void emptyResultSetHash() {
        SparqlResultHasher h = new SparqlResultHasher();
        assertEquals(0, h.getRowCount());
        String hash = h.computeHash();
        assertNotNull(hash);
        assertEquals(64, hash.length());
    }
}
