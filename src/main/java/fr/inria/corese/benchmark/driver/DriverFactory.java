package fr.inria.corese.benchmark.driver;

/**
 * Creates the appropriate TripleStoreDriver from an engine name.
 * Format: "corese.4.6.5", "corese.local", "jena.5.2.0", "rdf4j.5.1.3"
 */
public class DriverFactory {

    public static TripleStoreDriver create(String engineName) {
        return create(engineName, false);
    }

    public static TripleStoreDriver create(String engineName, boolean inference) {
        if (engineName.startsWith("corese.")) {
            return new CoreseDriver(engineName, inference);
        } else if (engineName.startsWith("jena.")) {
            return new JenaDriver(engineName);
        } else if (engineName.startsWith("rdf4j.")) {
            return new RDF4JDriver(engineName);
        } else {
            throw new IllegalArgumentException("Unknown engine: " + engineName
                + " (expected format: corese.X.X.X, jena.X.X.X, rdf4j.X.X.X)");
        }
    }
}
