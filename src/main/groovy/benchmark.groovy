import java.io.File

// Main execution
try {
    //def benchmark = new RDFBenchmark("corese.4.6.3")
    def benchmark = new RDFBenchmark("rdf4j.5.1.2")
    //def benchmark = new RDFBenchmark("jena.4.10.0")
    //benchmark.processDirectory('/Users/freddylimpens/src/tmp/bowlogna_benchmark/sample')
    benchmark.processDirectory('/Users/freddylimpens/src/tmp/bowlogna_benchmark/BowlognaOutput')
} catch (Exception e) {
    println "Error occurred: ${e.message}"
    throw e
} finally {
    println "Goodbye!"
    System.exit(0) 

}