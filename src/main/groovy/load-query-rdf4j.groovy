import org.eclipse.rdf4j.repository.Repository
import org.eclipse.rdf4j.repository.sail.SailRepository
import org.eclipse.rdf4j.sail.memory.MemoryStore
import org.eclipse.rdf4j.rio.RDFFormat
import java.io.File

// Step 1: Create an in-memory RDF4J repository
Repository repository = new SailRepository(new MemoryStore())
repository.init()

// Step 2: Open a connection to the repository
def connection = repository.connection

try {
    // Step 3: Load an RDF file into the repository
    File rdfFile = new File("src/main/resources/Bowlogna_bench_data/ddf.trig") // Replace with your RDF file path
    RDFFormat rdfFormat = RDFFormat.TRIG // Adjust format if needed (e.g., RDFFormat.TURTLE)

    connection.add(rdfFile, null, rdfFormat)
    println "RDF file loaded successfully!"

    // Step 4: Query the repository (optional)
    String query = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        SELECT (count(?s) as ?n)# ?p ?o
        WHERE {
            ?s ?p ?o .
        }
        #LIMIT 10
    """

    def tupleQuery = connection.prepareTupleQuery(query)
    def result = tupleQuery.evaluate()

    println "Query Results:"
    while (result.hasNext()) {
        def bindingSet = result.next()
        println bindingSet
    }
} finally {
    // Step 5: Close the connection
    connection.close()
    repository.shutDown()
}