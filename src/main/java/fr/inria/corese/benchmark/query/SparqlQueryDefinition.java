package fr.inria.corese.benchmark.query;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import java.util.List;

/** Immutable catalogue metadata; features are free-form tags, not capability identifiers. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SparqlQueryDefinition(
        @JsonProperty("id") String id,
        @JsonProperty("name") String name,
        @JsonProperty("file") String file,
        @JsonProperty("dataset") String dataset,
        @JsonProperty("primaryFeature") SparqlFeature primaryFeature,
        @JsonProperty("features") List<String> features,
        @JsonProperty("timeoutSecs") int timeoutSecs,
        @JsonProperty("validationMode") String validationMode) {

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
