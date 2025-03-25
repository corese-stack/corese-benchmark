import java.io.File
import fr.inria.corese.core.Graph
import fr.inria.corese.core.load.Load
import fr.inria.corese.core.api.Loader
import fr.inria.corese.core.query.QueryProcess
import fr.inria.corese.core.print.ResultFormat
import fr.inria.corese.core.kgram.core.Mappings

// Step 1: Create a graph object
Graph graph = Graph.create()

try {
    // Step 2: Load an RDF file 
    Load loader = Load.create(graph)
    loader.parse("src/main/resources/Bowlogna_bench_data/ddf.ttl", Loader.format.TURTLE_FORMAT)

    println "RDF file loaded successfully!"

    // Step 3: Query the repository (optional)
    String query = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        SELECT #(count(?s) as ?n)# 
        ?s ?p ?o
        WHERE {
            ?s ?p ?o .
        }
        LIMIT 10
    """

    // Load and execute SPARQL query
    QueryProcess exec = QueryProcess.create(graph);
    Mappings map = exec.query(query)

    // Print results in Markdown format
    println("-- Query Results --") 
    println(ResultFormat.create(map, ResultFormat.format.JSON_FORMAT).toString())

} finally {
    // Step 5: Close the connection
    println "Goodbye!"
}