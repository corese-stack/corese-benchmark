package fr.inria.corese.benchmark.driver;

import java.io.InputStream;
import java.util.Properties;

/**
 * Validates that requested benchmark engine identifiers match the actual
 * runtime classes and dependencies loaded in the current JVM.
 */
public final class EngineRuntimeVerifier {

    private static final String RUNTIME_PROPERTIES = "/engine-runtimes.properties";

    private static final String EXPECTED_JENA_VERSION;
    private static final String EXPECTED_RDF4J_VERSION;
    private static final String EXPECTED_CORESE_VERSION;

    static {
        Properties props = new Properties();
        try (InputStream in = EngineRuntimeVerifier.class.getResourceAsStream(RUNTIME_PROPERTIES)) {
            if (in == null) {
                throw new IllegalStateException("Missing required classpath resource: " + RUNTIME_PROPERTIES);
            }
            props.load(in);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load engine runtimes metadata from " + RUNTIME_PROPERTIES, e);
        }
        EXPECTED_JENA_VERSION = requireProperty(props, "jena.version");
        EXPECTED_RDF4J_VERSION = requireProperty(props, "rdf4j.version");
        EXPECTED_CORESE_VERSION = requireProperty(props, "corese.version");
    }

    private static String requireProperty(Properties props, String key) {
        String val = props.getProperty(key);
        if (val == null || val.isBlank()) {
            throw new IllegalStateException("Missing required runtime property '" + key + "' in " + RUNTIME_PROPERTIES);
        }
        return val.trim();
    }

    private EngineRuntimeVerifier() {}

    public static String getExpectedJenaVersion() {
        return EXPECTED_JENA_VERSION;
    }

    public static String getExpectedRdf4jVersion() {
        return EXPECTED_RDF4J_VERSION;
    }

    public static String getExpectedCoreseVersion() {
        return EXPECTED_CORESE_VERSION;
    }

    /**
     * Strictly verifies that the given engine identifier matches the runtime capabilities
     * and version built into the current classpath.
     *
     * @param engineName engine identifier (e.g. jena.6.2.0, rdf4j.6.1.0.lmdb, corese.4.6.5)
     * @throws IllegalArgumentException if the engine identifier does not match the runtime
     */
    public static void verifyEngineName(String engineName) {
        if (engineName == null || engineName.isBlank()) {
            throw new IllegalArgumentException("Engine name cannot be empty");
        }

        if (isCoreseEngine(engineName)) {
            verifyCoreseVersion(engineName);
        } else if (engineName.startsWith("jena.")) {
            verifyJenaVersion(engineName);
        } else if (engineName.startsWith("rdf4j.")) {
            verifyRdf4jVersion(engineName);
        } else {
            throw new IllegalArgumentException("Unknown engine: " + engineName
                + " (expected format: corese.X.X.X, corese.next, jena.X.X.X[.tdb2], rdf4j.X.X.X[.native|.lmdb])");
        }
    }

    private static boolean isCoreseEngine(String engineName) {
        return "corese.next".equals(engineName)
                || "corese.local".equals(engineName)
                || engineName.startsWith("corese.commit.")
                || engineName.startsWith("corese.");
    }

    private static void verifyCoreseVersion(String engineName) {
        if ("corese.next".equals(engineName) || "corese.local".equals(engineName)) {
            if (!"local".equals(EXPECTED_CORESE_VERSION) && !"jar".equals(EXPECTED_CORESE_VERSION)) {
                throw new IllegalArgumentException(String.format(
                    "Requested '%s', but current build is not configured with -PcoreseVersion=local or -PcoreseJar (current runtime: '%s').",
                    engineName, EXPECTED_CORESE_VERSION
                ));
            }
            return;
        }
        if (engineName.startsWith("corese.commit.")) {
            if (!"commit".equals(EXPECTED_CORESE_VERSION)) {
                throw new IllegalArgumentException(String.format(
                    "Requested '%s', but current build is not configured with -PcoreseCommit (current runtime: '%s').",
                    engineName, EXPECTED_CORESE_VERSION
                ));
            }
            return;
        }
        String ver = engineName.substring("corese.".length());
        if (!ver.equals(EXPECTED_CORESE_VERSION)) {
            throw new IllegalArgumentException(String.format(
                "Requested '%s', but current build runtime provides Corese '%s'. "
                + "Rebuild with -PcoreseVersion=%s or use exact runtime identifier.",
                engineName, EXPECTED_CORESE_VERSION, ver
            ));
        }
    }

    private static void verifyJenaVersion(String engineName) {
        String rest = engineName.substring("jena.".length());
        boolean tdb2 = rest.endsWith(".tdb2");
        String ver = tdb2 ? rest.substring(0, rest.length() - ".tdb2".length()) : rest;
        if (!ver.equals(EXPECTED_JENA_VERSION)) {
            throw new IllegalArgumentException(String.format(
                "Requested '%s', but current build runtime provides Apache Jena '%s'. "
                + "Rebuild with -PjenaVersion=%s or use exact runtime identifier.",
                engineName, EXPECTED_JENA_VERSION, ver
            ));
        }
    }

    private static void verifyRdf4jVersion(String engineName) {
        String rest = engineName.substring("rdf4j.".length());
        String ver = rest;
        if (rest.endsWith(".native")) {
            ver = rest.substring(0, rest.length() - ".native".length());
        } else if (rest.endsWith(".lmdb")) {
            ver = rest.substring(0, rest.length() - ".lmdb".length());
        }
        if (!ver.equals(EXPECTED_RDF4J_VERSION)) {
            throw new IllegalArgumentException(String.format(
                "Requested '%s', but current build runtime provides Eclipse RDF4J '%s'. "
                + "Rebuild with -Prdf4jVersion=%s or use exact runtime identifier.",
                engineName, EXPECTED_RDF4J_VERSION, ver
            ));
        }
    }
}
