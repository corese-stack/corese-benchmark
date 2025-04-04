class RDFLoaderFactory {
    static RDFLoader createLoader(String triplestoreName) {
        switch (triplestoreName) {
            case ~/corese.+/:
                return new CoreseRDFLoader()
            case ~/rdf4j.+/:
                return new RDF4JLoader()
            case ~/jena.+/:
                return new JenaRDFLoader()
            default:
                throw new IllegalArgumentException("Unsupported triplestore: ${triplestoreName}")
        }
    }
}