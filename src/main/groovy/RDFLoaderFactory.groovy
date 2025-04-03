class RDFLoaderFactory {
    static RDFLoader createLoader(String triplestoreName) {
        switch (triplestoreName) {
            case ~/corese.+/:
                return new CoreseRDFLoader()
            case ~/rdf4j.+/:
                return new RDF4JLoader()
            default:
                throw new IllegalArgumentException("Unsupported triplestore: ${triplestoreName}")
        }
    }
}