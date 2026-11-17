package fr.inria.corese.benchmark.query;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SparqlQueryDefinitionTest {
    @Test
    void deserializesCatalogueEntryAndIgnoresDocumentation() throws Exception {
        var definition = new ObjectMapper().readValue("""
                {"id":"Q01","name":"Example","file":"lubm/q.rq","dataset":"lubm",
                 "primaryFeature":"BGP_JOIN","features":["star"],"timeoutSecs":30,
                 "validationMode":"unordered_exact","description":"Documentation"}
                """, SparqlQueryDefinition.class);
        assertEquals("Q01", definition.id());
        assertEquals(SparqlFeature.BGP_JOIN, definition.primaryFeature());
        assertEquals(List.of("star"), definition.features());
        assertEquals(30, definition.timeoutSecs());
        assertEquals("unordered_exact", definition.validationMode());
    }

    @Test
    void copiesTagsAndAllowsMissingPrimaryFeature() {
        var tags = new ArrayList<>(List.of("star"));
        var definition = definition(tags, 30, "ordered_exact");
        tags.clear();
        assertEquals(List.of("star"), definition.features());
        assertNull(definition.primaryFeature());
        assertThrows(UnsupportedOperationException.class, () -> definition.features().clear());
    }

    @Test
    void rejectsInvalidExecutionMetadata() {
        assertThrows(IllegalArgumentException.class, () -> definition(List.of(), 0, "ordered_exact"));
        assertThrows(IllegalArgumentException.class, () -> definition(List.of(), 30, "approximate"));
        assertThrows(IllegalArgumentException.class, () -> new SparqlQueryDefinition(
                " ", "Example", "q.rq", "lubm", null, null, 30, "unordered_exact"));
    }

    private static SparqlQueryDefinition definition(List<String> tags, int timeout, String mode) {
        return new SparqlQueryDefinition("Q01", "Example", "q.rq", "lubm", null, tags, timeout, mode);
    }
}
