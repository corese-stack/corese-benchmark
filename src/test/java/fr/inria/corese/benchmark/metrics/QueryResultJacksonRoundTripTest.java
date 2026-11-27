package fr.inria.corese.benchmark.metrics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

class QueryResultJacksonRoundTripTest {

    @Test
    void testQueryResultSerializationAndDeserializationRoundTrip() throws Exception {
        QueryResult original = new QueryResult(
            "corese.next",
            "bowlogna",
            "Q10",
            "AGGREGATION_ANALYTICS",
            8319.73,
            new double[]{8320.1, 8319.73, 8318.5},
            8319.59,
            new double[]{8320.0, 8319.59, 8318.0},
            142.5,
            200,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "PASS",
            new String[]{"PASS", "PASS", "PASS"},
            List.of("error detail if any"),
            true
        );

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        String json = mapper.writeValueAsString(original);

        QueryResult deserialized = mapper.readValue(json, QueryResult.class);

        assertEquals(original.engine(), deserialized.engine());
        assertEquals(original.dataset(), deserialized.dataset());
        assertEquals(original.queryId(), deserialized.queryId());
        assertEquals(original.queryCategory(), deserialized.queryCategory());
        assertEquals(original.medianMs(), deserialized.medianMs(), 0.001);
        assertEquals(original.medianTtfrMs(), deserialized.medianTtfrMs(), 0.001);
        assertEquals(original.heapDeltaMb(), deserialized.heapDeltaMb(), 0.001);
        assertEquals(original.rowCount(), deserialized.rowCount());
        assertEquals(original.resultHash(), deserialized.resultHash());
        assertEquals(original.status(), deserialized.status());
        assertArrayEquals(original.repetitionsMs(), deserialized.repetitionsMs(), 0.001);
        assertArrayEquals(original.repetitionsTtfrMs(), deserialized.repetitionsTtfrMs(), 0.001);
        assertArrayEquals(original.repetitionsStatuses(), deserialized.repetitionsStatuses());
        assertEquals(original.repetitionErrors(), deserialized.repetitionErrors());
        assertEquals(original.hasBlankNodes(), deserialized.hasBlankNodes());
        assertEquals(original, deserialized);
    }

    @Test
    void testTreeToValueArrayDeserialization() throws Exception {
        // Replicates Main.readChildReport() path exactly: mapper.treeToValue(root.get("queryRuns"), QueryResult[].class)
        String jsonArray = """
        {
          "queryRuns": [
            {
              "engine": "corese.next",
              "dataset": "bowlogna",
              "queryId": "Q1",
              "queryCategory": "GRAPH_PATTERN",
              "medianMs": 12.5,
              "repetitionsMs": [12.0, 12.5, 13.0],
              "medianTtfrMs": 1.2,
              "repetitionsTtfrMs": [1.1, 1.2, 1.3],
              "heapDeltaMb": 4.5,
              "rowCount": 50,
              "resultHash": "abc123hash",
              "status": "PASS",
              "repetitionsStatuses": ["PASS", "PASS", "PASS"],
              "repetitionErrors": [],
              "hasBlankNodes": false
            }
          ]
        }
        """;

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        JsonNode root = mapper.readTree(jsonArray);
        QueryResult[] qrs = mapper.treeToValue(root.get("queryRuns"), QueryResult[].class);

        assertEquals(1, qrs.length);
        assertEquals("corese.next", qrs[0].engine());
        assertEquals("Q1", qrs[0].queryId());
        assertEquals("PASS", qrs[0].status());
    }
}

