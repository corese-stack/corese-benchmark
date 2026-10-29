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
        SparqlResultHasher h1 = new SparqlResultHasher();
        h1.addRow(Map.of("x", "http://example.org/1", "y", "42"));
        h1.addRow(Map.of("x", "http://example.org/2", "y", "99"));

        SparqlResultHasher h2 = new SparqlResultHasher();
        h2.addRow(Map.of("x", "http://example.org/2", "y", "99"));
        h2.addRow(Map.of("x", "http://example.org/1", "y", "42"));

        assertEquals(2, h1.getRowCount());
        assertEquals(2, h2.getRowCount());
        assertEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Ordered mode distinguishes different row orderings")
    void orderedModeIsOrderSensitive() {
        SparqlResultHasher h1 = new SparqlResultHasher(true);
        h1.addRow(List.of("A", "B"));
        h1.addRow(List.of("C", "D"));

        SparqlResultHasher h2 = new SparqlResultHasher(true);
        h2.addRow(List.of("C", "D"));
        h2.addRow(List.of("A", "B"));

        assertEquals(2, h1.getRowCount());
        assertEquals(2, h2.getRowCount());
        assertNotEquals(h1.computeHash(), h2.computeHash());
    }

    @Test
    @DisplayName("Unbound values do not collide with adjacent non-null strings")
    void unboundDoesNotCollide() {
        SparqlResultHasher h1 = new SparqlResultHasher();
        h1.addRow(ArraysListHelper.of("ab", null));

        SparqlResultHasher h2 = new SparqlResultHasher();
        h2.addRow(ArraysListHelper.of("a", "b"));

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

    private static class ArraysListHelper {
        @SafeVarargs
        static <T> List<T> of(T... elements) {
            return java.util.Arrays.asList(elements);
        }
    }
}
