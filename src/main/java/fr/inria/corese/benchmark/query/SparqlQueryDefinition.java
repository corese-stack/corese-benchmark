package fr.inria.corese.benchmark.query;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import java.util.List;

/** Immutable catalogue metadata; features are free-form tags, not capability identifiers. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SparqlQueryDefinition(
        String id, String name, String file, String dataset,
        SparqlFeature primaryFeature, List<String> features,
        int timeoutSecs, String validationMode) {

    public SparqlQueryDefinition {
        requireText(id, "id");
        requireText(name, "name");
        requireText(file, "file");
        requireText(dataset, "dataset");
        if (timeoutSecs <= 0) {
            throw new IllegalArgumentException("timeoutSecs must be positive");
        }
        if (!"unordered_exact".equals(validationMode) && !"ordered_exact".equals(validationMode)) {
            throw new IllegalArgumentException("Unsupported validationMode: " + validationMode);
        }
        features = features == null ? List.of() : List.copyOf(features);
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
