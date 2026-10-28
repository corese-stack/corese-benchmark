package fr.inria.corese.benchmark.driver;

/**
 * Creates the appropriate TripleStoreDriver from an engine name.
 * Format: "corese.4.6.5", "corese.local", "corese.next", "jena.5.2.0", "rdf4j.5.1.3"
 */
public final class DriverFactory {

    private DriverFactory() {}

    private static final String CORESE_NEXT_CLASS =
            "fr.inria.corese.benchmark.driver.CoreseNextDriver";

    private static final String CORESE_DRIVER_CLASS =
            "fr.inria.corese.benchmark.driver.CoreseDriver";


    /**
     * Creates a driver for the given engine name.
     *
     * <p>Engine name prefix determines the implementation:
     * <ul>
     *   <li>{@code corese.next} — {@link CoreseNextDriver} loaded via reflection</li>
     *   <li>{@code corese.*}    — {@code CoreseDriver} with optional RDFS inference</li>
     *   <li>{@code jena.*}      — {@link JenaDriver}</li>
     *   <li>{@code rdf4j.*}     — {@link RDF4JDriver}</li>
     * </ul>
     *
     * @param engineName engine identifier string
     * @param inference  {@code true} to enable RDFS inference (only applies to Corese drivers)
     * @return a ready-to-use {@link TripleStoreDriver} (not yet initialised)
     * @throws IllegalArgumentException if the engine name is not recognised or if
     *         {@code corese.next} is requested but the Corese 5 JAR is absent
     */
    public static TripleStoreDriver create(String engineName, boolean inference) {
        if ("corese.next".equals(engineName) || "corese.local".equals(engineName)) {
            return createCoreseNext(engineName);
        } else if (engineName.startsWith("corese.")) {
            return createCoreseDriver(engineName, inference);
        } else if (engineName.startsWith("jena.")) {
            return new JenaDriver(engineName);
        } else if (engineName.startsWith("rdf4j.")) {
            return new RDF4JDriver(engineName);
        } else {
            throw new IllegalArgumentException("Unknown engine: " + engineName
                + " (expected format: corese.X.X.X, corese.next, jena.X.X.X, rdf4j.X.X.X)");
        }
    }

    /**
     * Instantiates {@link CoreseNextDriver} via reflection so that the main classpath
     * does not need a hard compile-time dependency on the Corese 5 JAR.
     *
     * @param engineName engine name passed through to the driver constructor
     * @return a new {@link CoreseNextDriver} instance
     * @throws IllegalArgumentException if the Corese 5 JAR is not on the classpath
     * @throws RuntimeException         if reflection-based instantiation fails for any other reason
     */
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

    @SuppressWarnings("unchecked")
    private static TripleStoreDriver createCoreseDriver(String engineName, boolean inference) {
        try {
            Class<? extends TripleStoreDriver> cls =
                    (Class<? extends TripleStoreDriver>) Class.forName(CORESE_DRIVER_CLASS);
            return cls.getDeclaredConstructor(String.class, boolean.class)
                      .newInstance(engineName, inference);
        } catch (ClassNotFoundException | NoClassDefFoundError e) {
            throw new IllegalArgumentException(
                "CoreseDriver not available in this build (corese-next build excludes it)", e);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException("Failed to instantiate CoreseDriver", e);
        }
    }
}
