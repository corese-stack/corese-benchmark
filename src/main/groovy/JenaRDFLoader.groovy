import org.apache.jena.rdf.model.Model
import org.apache.jena.rdf.model.ModelFactory
import org.apache.jena.riot.RDFDataMgr
import org.apache.jena.riot.Lang

class JenaRDFLoader implements RDFLoader {
    private Model model
    
    @Override
    void init() {
        model = ModelFactory.createDefaultModel()
    }
    
    @Override
    void loadFile(String filepath) {
        RDFDataMgr.read(model, filepath, Lang.NT)
    }
    
    @Override
    long getGraphSize() {
        return model.size()
    }
    
    @Override
    void close() {
        model.close()
    }
}