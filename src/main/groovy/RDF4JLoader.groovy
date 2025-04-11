import org.eclipse.rdf4j.repository.Repository
import org.eclipse.rdf4j.repository.sail.SailRepository
import org.eclipse.rdf4j.repository.RepositoryConnection
import org.eclipse.rdf4j.sail.memory.MemoryStore
import org.eclipse.rdf4j.rio.RDFFormat
import org.eclipse.rdf4j.rio.RDFHandlerException
import org.eclipse.rdf4j.rio.RDFParseException
import org.eclipse.rdf4j.rio.RDFParser
import org.eclipse.rdf4j.rio.Rio
import org.eclipse.rdf4j.rio.helpers.StatementCollector
import org.eclipse.rdf4j.model.Resource

import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream
import java.io.File

class RDF4JLoader implements RDFLoader {

    // Step 1: Create an in-memory RDF4J repository
    // Step 2: Open a connection to the repository
    private Repository repository
    private RepositoryConnection connection

    @Override
    void init() {
        repository = new SailRepository(new MemoryStore())
        repository.init()
        connection = repository.getConnection()
    }

    @Override
    void loadFile(String filepath) {
        File rdfFile = new File(filepath)
        //connection.add(rdfFile, null, RDFFormat.NTRIPLES)
        try (InputStream inputStream = new FileInputStream(rdfFile)) {
            RDFParser parser = Rio.createParser(RDFFormat.NTRIPLES)
            StatementCollector collector = new StatementCollector()
            parser.setRDFHandler(collector)

            try {
                println('1. parsing')
                parser.parse(inputStream, "")
                println('2. loading')
                connection.add(collector.getStatements(), new Resource[0])
            } catch (RDFParseException | RDFHandlerException e) {
                // Handle parsing errors here, e.g., log the error and continue
                System.err.println("Error parsing file: " + e.getMessage())
            }
        } catch (IOException e) {
            // Handle IO errors here, e.g., log the error
            System.err.println("Error reading file: " + e.getMessage())
        }
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
        if (connection != null) {
            connection.close();
        }
        if (repository != null) {
            repository.shutDown();
        }
    }
}
