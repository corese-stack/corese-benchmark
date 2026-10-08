package fr.inria.corese.benchmark.driver;

/**
 * Creates the appropriate TripleStoreDriver from an engine name.
 * Format: "corese.4.6.5", "corese.local", "corese.next", "jena.5.2.0", "rdf4j.5.1.3"
 */
public class DriverFactory {

    private static final String CORESE_NEXT_CLASS =
            "fr.inria.corese.benchmark.driver.CoreseNextDriver";

    public static TripleStoreDriver create(String engineName) {
        return create(engineName, false);
    }

    public static TripleStoreDriver create(String engineName, boolean inference) {
        if ("corese.next".equals(engineName)) {
            return createCoreseNext(engineName);
        } else if (engineName.startsWith("corese.")) {
            return new CoreseDriver(engineName, inference);
        } else if (engineName.startsWith("jena.")) {
            return new JenaDriver(engineName);
        } else if (engineName.startsWith("rdf4j.")) {
            return new RDF4JDriver(engineName);
        } else {
            throw new IllegalArgumentException("Unknown engine: " + engineName
                + " (expected format: corese.X.X.X, corese.next, jena.X.X.X, rdf4j.X.X.X)");
        }
    }

    @SuppressWarnings("unchecked")
    private static TripleStoreDriver createCoreseNext(String engineName) {
        try {
            Class<? extends TripleStoreDriver> cls =
                    (Class<? extends TripleStoreDriver>) Class.forName(CORESE_NEXT_CLASS);
            return cls.getDeclaredConstructor(String.class).newInstance(engineName);
        } catch (ClassNotFoundException | NoClassDefFoundError e) {
            throw new IllegalArgumentException(
                "Engine 'corese.next' requires the Corese 5 JAR in libs/ "
                + "— place the JAR in libs/ and rebuild with -PcoreseVersion=local", e);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException("Failed to instantiate CoreseNextDriver", e);
        }
    }
}
