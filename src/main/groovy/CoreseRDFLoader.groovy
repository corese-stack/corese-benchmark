import fr.inria.corese.core.Graph
import fr.inria.corese.core.load.Load
import fr.inria.corese.core.api.Loader

class CoreseRDFLoader implements RDFLoader {
    
    private final Graph graph
    private final Load loader

    CoreseRDFLoader() {
        this.graph = Graph.create()
        this.loader = Load.create(graph)
    }

    @Override
    void init() {
        // Corese doesn't need explicit initialization
    }

    @Override
    void loadFile(String filepath) {
        loader.parse(filepath, Loader.format.NT_FORMAT)
    }

    @Override
    long getGraphSize() {
        return graph.size()
    }

    @Override
    void close() {
        // Clean up if needed
    }
}