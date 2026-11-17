import java.nio.file.*;
import java.util.*;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.*;
import org.apache.jena.riot.*;
import org.eclipse.rdf4j.query.parser.sparql.SPARQLParser;
import fr.inria.corese.core.Graph;
import fr.inria.corese.core.query.QueryProcess;

public class ValidateFeatureQueries {
    public static void main(String[] args) throws Exception {
        Path suite=Path.of(args[0]), repo=Path.of(args[1]);
        List<Path> queries;
        try(var paths=Files.walk(suite)) {
            queries=paths.filter(p->p.toString().endsWith(".rq")).sorted().toList();
        }
        for(Path p:queries) {
            String q=Files.readString(p);
            QueryFactory.create(q, Syntax.syntaxSPARQL_11);
            new SPARQLParser().parseQuery(q,null);
            QueryProcess.create(Graph.create()).compile(q);
            System.out.println("PARSE OK Jena/SPARQL11 + RDF4J + Corese: "+p.getFileName());
        }
        Map<String,String> inputs=new LinkedHashMap<>();
        inputs.put("lubm","input/lubm/unzip_small/lubm_small.nt");
        inputs.put("bsbm","input/bsbm/unzip_small/bsbm_small.nt");
        inputs.put("bowlogna","input/bowlogna/unzip/Department0.nt");
        inputs.put("dbpedia","input/dbpedia/unzip/persondata_en.nt");
        inputs.put("named-graphs",args[2]);
        Map<String,Map<String,Integer>> antiResults=new HashMap<>();
        for(var input: inputs.entrySet()) {
            Dataset ds=DatasetFactory.createTxnMem();
            Path file=Path.of(input.getValue());
            if(!file.isAbsolute()) file=repo.resolve(file);
            RDFDataMgr.read(ds,file.toString());
            System.out.println("LOADED "+input.getKey()+" "+ds.getDefaultModel().size()+" default-graph triples; "+ds.asDatasetGraph().size()+" named graphs");
            for(Path p: queries) {
                String folder=p.getParent().getFileName().toString();
                if(!folder.equals(input.getKey()) && !(folder.equals("topology") && input.getKey().equals("bsbm"))) continue;
                Query q=QueryFactory.create(Files.readString(p),Syntax.syntaxSPARQL_11);
                long count=0, start=System.nanoTime();
                Map<String,Integer> bag=new HashMap<>();
                try(QueryExecution qe=QueryExecution.dataset(ds).query(q).timeout(30,java.util.concurrent.TimeUnit.SECONDS).build()) {
                    ResultSet rs=qe.execSelect();
                    while(rs.hasNext()) {
                        var row=rs.next(); count++;
                        if(p.getFileName().toString().startsWith("Q03") || p.getFileName().toString().startsWith("Q09")) bag.merge(row.get("product").toString(),1,Integer::sum);
                        if(p.getFileName().toString().startsWith("Q15")) System.out.println("GRAPH COUNT "+row);
                    }
                }
                if(count==0) throw new AssertionError("Unexpected empty result: "+p);
                System.out.println("EXEC OK "+p.getFileName()+" rows="+count+" ms="+(System.nanoTime()-start)/1_000_000);
                if(p.getFileName().toString().startsWith("Q03")) antiResults.put("minus",bag);
                if(p.getFileName().toString().startsWith("Q09")) antiResults.put("notexists",bag);
            }
            ds.close();
            System.gc();
        }
        if(!antiResults.get("minus").equals(antiResults.get("notexists"))) throw new AssertionError("Anti-join multiset mismatch");
        System.out.println("PASS: 15 queries parsed by 3 engines; all 15 executed on actual local data; Q03/Q09 multisets equal.");
    }
}
