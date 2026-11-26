package fr.inria.corese.benchmark.driver;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EngineRuntimeVerifierTest {

    @Test
    @DisplayName("Accepts matching resolved engine identifiers")
    void testAcceptsExactRuntimeEngines() {
        String jena = "jena." + EngineRuntimeVerifier.getExpectedJenaVersion();
        String jenaTdb2 = jena + ".tdb2";
        String rdf4j = "rdf4j." + EngineRuntimeVerifier.getExpectedRdf4jVersion();
        String rdf4jNative = rdf4j + ".native";
        String rdf4jLmdb = rdf4j + ".lmdb";

        assertDoesNotThrow(() -> EngineRuntimeVerifier.verifyEngineName(jena));
        assertDoesNotThrow(() -> EngineRuntimeVerifier.verifyEngineName(jenaTdb2));
        assertDoesNotThrow(() -> EngineRuntimeVerifier.verifyEngineName(rdf4j));
        assertDoesNotThrow(() -> EngineRuntimeVerifier.verifyEngineName(rdf4jNative));
        assertDoesNotThrow(() -> EngineRuntimeVerifier.verifyEngineName(rdf4jLmdb));
    }

    @ParameterizedTest(name = "Rejects invalid or mismatched engine: {0}")
    @ValueSource(strings = {
        "", "   ", "unknown", "virtuoso.7.2",
        "jena.0.0.1", "jena.99.99.99", "jena.wrong.version",
        "rdf4j.0.0.1", "rdf4j.99.99.99.lmdb",
        "corese.0.0.1", "corese.phantom"
    })
    void testRejectsMismatchedOrInvalidEngines(String engineName) {
        assertThrows(IllegalArgumentException.class, () -> EngineRuntimeVerifier.verifyEngineName(engineName));
    }
}
