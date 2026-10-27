package fr.inria.corese.benchmark.metrics;

import java.util.regex.Pattern;

/**
 * Classifies a SPARQL query string into one of four structural categories.
 * Used to tag {@link QueryResult} records and drive query-type filtering in the dashboard.
 *
 * <p>Classification rules are checked in priority order:
 * {@code SUBQUERY > GROUP_BY > TEMPORAL > GRAPH_PATTERN}.</p>
 */
public final class SparqlAnalyser {

    public enum QueryCategory {
        /** Basic graph pattern joins — no aggregation, no temporal functions, no subqueries. */
        GRAPH_PATTERN,
        /** Contains temporal functions: NOW(), xsd:dateTime, xsd:date, DAY/MONTH/YEAR/HOURS/MINUTES/SECONDS. */
        TEMPORAL,
        /** Contains GROUP BY aggregation. */
        GROUP_BY,
        /** Contains a nested SELECT (subquery). */
        SUBQUERY
    }

    // Patterns applied to stripped, uppercased SPARQL text
    private static final Pattern P_SUBQUERY  = Pattern.compile("\\{[^{}]*\\bSELECT\\b");
    private static final Pattern P_GROUP_BY  = Pattern.compile("\\bGROUP\\s+BY\\b");
    private static final Pattern P_TEMPORAL  = Pattern.compile(
        "\\bNOW\\s*\\(|\\bXSD:DATETIME\\b|\\bXSD:DATE\\b" +
        "|\\b(?:DAY|MONTH|YEAR|HOURS|MINUTES|SECONDS)\\s*\\(");
    // Strip IRIs, then single-line comments, then quoted string literals before matching.
    // Order matters: IRIs must be removed first so that fragment identifiers (e.g. rdf-schema#type)
    // are not mistaken for SPARQL comment markers.
    private static final Pattern P_IRI      = Pattern.compile("<[^>]*>");
    private static final Pattern P_COMMENT  = Pattern.compile("#[^\n]*");
    private static final Pattern P_STRING   = Pattern.compile("\"[^\"]*\"|'[^']*'");

    private SparqlAnalyser() {}

    /**
     * Classifies a SPARQL query string.
     *
     * @param sparql the SPARQL query text (may contain PREFIX declarations and comments)
     * @return the detected {@link QueryCategory}
     */
    public static QueryCategory classify(String sparql) {
        if (sparql == null || sparql.isBlank()) return QueryCategory.GRAPH_PATTERN;
        // Strip IRIs first (removes fragment # in e.g. rdf-schema#type), then comments, then string literals
        String cleaned = P_STRING.matcher(
                            P_COMMENT.matcher(
                                P_IRI.matcher(sparql).replaceAll("<>")
                            ).replaceAll("")
                         ).replaceAll("\"\"");
        String upper   = cleaned.toUpperCase();

        if (P_SUBQUERY.matcher(upper).find()) return QueryCategory.SUBQUERY;
        if (P_GROUP_BY.matcher(upper).find()) return QueryCategory.GROUP_BY;
        if (P_TEMPORAL.matcher(upper).find()) return QueryCategory.TEMPORAL;
        return QueryCategory.GRAPH_PATTERN;
    }
}
