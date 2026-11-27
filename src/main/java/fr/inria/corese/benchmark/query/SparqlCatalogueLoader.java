package fr.inria.corese.benchmark.query;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import fr.inria.corese.benchmark.metrics.SparqlAnalyser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Loads a catalogue and resolves UTF-8 query files relative to its directory. */
public final class SparqlCatalogueLoader {
    private final ObjectMapper mapper = new ObjectMapper();

    /** A query with resolved metadata and its complete, unmodified multiline text. */
    public record LoadedQuery(SparqlQueryDefinition definition, String sparql) { }

    /**
     * Returns an immutable list in catalogue order. Missing metadata uses catalogue
     * defaults (or 30 seconds and unordered_exact); absent primary features are inferred.
     * Malformed entries, duplicate IDs and files outside the catalogue directory fail
     * the complete load with an IOException; no partial catalogue is returned.
     */
    public List<LoadedQuery> load(Path catalogue) throws IOException {
        Path base = catalogue.toRealPath().getParent();
        JsonNode root;
        try (var reader = Files.newBufferedReader(catalogue, StandardCharsets.UTF_8)) {
            root = mapper.readTree(reader);
        }
        if (root == null || !root.path("queries").isArray()) {
            throw new IOException("Catalogue must contain a queries array: " + catalogue);
        }
        var queries = new ArrayList<LoadedQuery>();
        var ids = new HashSet<String>();
        for (JsonNode entry : root.path("queries")) {
            LoadedQuery query = loadEntry(entry, root.path("defaults"), base);
            if (!ids.add(query.definition().id())) {
                throw new IOException("Duplicate query ID: " + query.definition().id());
            }
            queries.add(query);
        }
        return List.copyOf(queries);
    }

    private LoadedQuery loadEntry(JsonNode entry, JsonNode defaults, Path base) throws IOException {
        if (!(entry instanceof ObjectNode object)) {
            throw new IOException("Query entry must be an object: " + entry);
        }
        ObjectNode metadata = object.deepCopy();
        applyDefault(metadata, defaults, "timeoutSecs", mapper.getNodeFactory().numberNode(30));
        applyDefault(metadata, defaults, "validationMode", mapper.getNodeFactory().textNode("unordered_exact"));
        try {
            var definition = mapper.treeToValue(metadata, SparqlQueryDefinition.class);
            Path file = resolveQueryFile(base, definition.file());
            String sparql = Files.readString(file, StandardCharsets.UTF_8);
            if (sparql.isBlank()) {
                throw new IOException("Empty query file: " + file);
            }
            var feature = SparqlAnalyser.classifyFeature(sparql, definition.primaryFeature());
            var resolved = new SparqlQueryDefinition(definition.id(), definition.name(), definition.file(),
                    definition.dataset(), feature, definition.features(), definition.timeoutSecs(),
                    definition.validationMode());
            return new LoadedQuery(resolved, sparql);
        } catch (IllegalArgumentException exception) {
            throw new IOException("Invalid query entry: " + entry.path("id").asText(), exception);
        }
    }

    private static void applyDefault(ObjectNode entry, JsonNode defaults, String field, JsonNode fallback) {
        if (!entry.has(field)) {
            entry.set(field, defaults.has(field) ? defaults.get(field) : fallback);
        }
    }

    private static Path resolveQueryFile(Path base, String file) throws IOException {
        Path relative = Path.of(file);
        Path resolved = base.resolve(relative).normalize();
        if (relative.isAbsolute() || !resolved.startsWith(base) || !file.endsWith(".rq")) {
            throw new IOException("Query file must be a relative .rq path inside the catalogue: " + file);
        }
        Path real = resolved.toRealPath();
        if (!real.startsWith(base)) {
            throw new IOException("Query file escapes catalogue through a symbolic link: " + file);
        }
        return real;
    }
}
