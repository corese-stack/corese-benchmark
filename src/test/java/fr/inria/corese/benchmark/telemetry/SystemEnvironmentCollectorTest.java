package fr.inria.corese.benchmark.telemetry;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SystemEnvironmentCollectorTest {

    @Test
    void collectsAllRequiredEnvironmentKeys() {
        Map<String, Object> env = SystemEnvironmentCollector.collect();

        assertNotNull(env);

        // Required keys from schema
        List<String> expectedKeys = List.of(
                "cpuModel",
                "cpuArchitecture",
                "cpuSockets",
                "cpuCores",
                "cpuThreads",
                "cpuFrequencyMhz",
                "cpuGovernor",
                "ramTotalGb",
                "swapTotalGb",
                "swappiness",
                "osDistribution",
                "osKernel",
                "jvmVendor",
                "jvmVersion",
                "jvmFlags"
        );

        for (String key : expectedKeys) {
            assertTrue(env.containsKey(key), "Environment map missing expected key: " + key);
            assertNotNull(env.get(key), "Value for key " + key + " must not be null");
        }

        // Validate types
        assertInstanceOf(String.class, env.get("cpuModel"));
        assertInstanceOf(String.class, env.get("cpuArchitecture"));
        assertInstanceOf(Integer.class, env.get("cpuSockets"));
        assertInstanceOf(Integer.class, env.get("cpuCores"));
        assertInstanceOf(Integer.class, env.get("cpuThreads"));
        assertInstanceOf(Double.class, env.get("cpuFrequencyMhz"));
        assertInstanceOf(String.class, env.get("cpuGovernor"));
        assertInstanceOf(Double.class, env.get("ramTotalGb"));
        assertInstanceOf(Double.class, env.get("swapTotalGb"));
        assertInstanceOf(Integer.class, env.get("swappiness"));
        assertInstanceOf(String.class, env.get("osDistribution"));
        assertInstanceOf(String.class, env.get("osKernel"));
        assertInstanceOf(String.class, env.get("jvmVendor"));
        assertInstanceOf(String.class, env.get("jvmVersion"));
        assertInstanceOf(List.class, env.get("jvmFlags"));

        // Basic assertions on host values
        assertTrue((int) env.get("cpuCores") > 0);
        assertTrue((int) env.get("cpuThreads") > 0);
        assertTrue((double) env.get("ramTotalGb") > 0);
    }
}
