import org.eclipse.rdf4j.repository.Repository
import org.eclipse.rdf4j.repository.sail.SailRepository
import org.eclipse.rdf4j.sail.memory.MemoryStore
import org.eclipse.rdf4j.rio.RDFFormat
import java.io.File

class RDF4JLoader implements RDFLoader {

    // Step 1: Create an in-memory RDF4J repository
    // Step 2: Open a connection to the repository
    private Repository repository
    private def connection

    @Override
    void init() {
        repository = new SailRepository(new MemoryStore())
        repository.init()
        connection = repository.getConnection()
    }

    @Override
    void loadFile(String filepath) {
        File rdfFile = new File(filepath)
        connection.add(rdfFile, null, RDFFormat.NTRIPLES)
    }

    @Override
    long getGraphSize() {
        def query = """
            SELECT (COUNT(?s) as ?count)
            WHERE {
                ?s ?p ?o .
            }
        """
        def tupleQuery = connection.prepareTupleQuery(query)
        def result = tupleQuery.evaluate()
        return result.next().getValue("count").longValue()
    }

    @Override
    void close() {
        connection.close()
        //repository?.shutDown()
    }
}