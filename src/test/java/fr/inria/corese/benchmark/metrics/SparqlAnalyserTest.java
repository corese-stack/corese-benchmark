package fr.inria.corese.benchmark.metrics;

import fr.inria.corese.benchmark.metrics.SparqlAnalyser.QueryCategory;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.junit.jupiter.api.Assertions.*;

class SparqlAnalyserTest {
    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            BGP_JOIN | SELECT * WHERE { ?s <urn:p> ?o . ?o <urn:q> ?v }
            PROPERTY_PATH | SELECT * WHERE { ?s <urn:p>+ ?o }
            PROPERTY_PATH | SELECT * WHERE { ?s ^<urn:p>/<urn:q> ?o }
            OPTIONAL_LEFT_JOIN | SELECT * WHERE { ?s ?p ?o OPTIONAL { ?o ?q ?v } }
            NEGATION | SELECT * WHERE { ?s ?p ?o MINUS { ?s ?p 1 } }
            NEGATION | SELECT * WHERE { ?s ?p ?o FILTER(NOT EXISTS { ?s ?p 1 } && ?o > 0) }
            AGGREGATION_ANALYTICS | SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o }
            SUBQUERY | SELECT * WHERE { { SELECT * WHERE { ?s ?p ?o } } }
            FILTER_FUNCTIONS | SELECT * WHERE { ?s ?p ?o FILTER(?o < 3) }
            FILTER_FUNCTIONS | SELECT (STR(?s) AS ?text) WHERE { ?s ?p ?o }
            NAMED_GRAPH | SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }
            NAMED_GRAPH | SELECT * FROM NAMED <urn:g> WHERE { ?s ?p ?o }
            SOLUTION_MODIFIERS | SELECT DISTINCT * WHERE { ?s ?p ?o }
            SOLUTION_MODIFIERS | SELECT * WHERE { ?s ?p ?o } ORDER BY ?s LIMIT 1 OFFSET 2
            """)
    void detectsSyntax(SparqlFeature expected, String sparql) {
        assertEquals(expected, SparqlAnalyser.classifyFeature(sparql));
    }

    @Test
    void ignoresKeywordsInIrisCommentsVariablesAndEscapedMultilineStrings() {
        String sparql = """
                # SELECT MINUS GRAPH OPTIONAL
                SELECT ?optional WHERE {
                    ?optional <urn:GRAPH#MINUS> \"\"\"SELECT \\"GRAPH\\"
OPTIONAL\"\"\" .
                }
                """;
        assertEquals(SparqlFeature.BGP_JOIN, SparqlAnalyser.classifyFeature(sparql));
    }

    @Test
    void explicitMetadataHasPriorityAndEmptyInputFailsWithoutMetadata() {
        assertEquals(SparqlFeature.NAMED_GRAPH,
                SparqlAnalyser.classifyFeature("SELECT * WHERE {}", SparqlFeature.NAMED_GRAPH));
        assertThrows(IllegalArgumentException.class, () -> SparqlAnalyser.classifyFeature(null));
        assertThrows(IllegalArgumentException.class, () -> SparqlAnalyser.classifyFeature(" "));
        assertThrows(IllegalArgumentException.class, () -> SparqlAnalyser.classifyFeature("SELECT broken"));
    }

    @Test
    void preservesLegacyCategories() {
        assertEquals(QueryCategory.GRAPH_PATTERN, SparqlAnalyser.classify(null));
        assertEquals(QueryCategory.SUBQUERY,
                SparqlAnalyser.classify("SELECT * WHERE {{SELECT * WHERE {?s ?p ?o}}}"));
        assertEquals(QueryCategory.GROUP_BY,
                SparqlAnalyser.classify("SELECT ?s WHERE {?s ?p ?o} GROUP BY ?s"));
        assertEquals(QueryCategory.TEMPORAL, SparqlAnalyser.classify("SELECT (NOW() AS ?now) WHERE {}"));
    }
}
