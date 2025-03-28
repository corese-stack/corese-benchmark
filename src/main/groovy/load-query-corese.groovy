import java.io.File
import java.text.SimpleDateFormat

import fr.inria.corese.core.Graph
import fr.inria.corese.core.load.Load
import fr.inria.corese.core.api.Loader
import fr.inria.corese.core.query.QueryProcess
import fr.inria.corese.core.print.ResultFormat
import fr.inria.corese.core.kgram.core.Mappings

// Step 1: Create a graph object
Graph graph = Graph.create()

try {
    // Create output directory and CSV file
    def outDir = new File("out")
    if (!outDir.exists()) {
        outDir.mkdir()
    }
    
    // Create CSV file with timestamp
    def timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss").format(new Date())
    def csvFile = new File(outDir, "loading-metrics-${timestamp}.csv")
    
    // Write CSV header
    csvFile.write("file,loading_time_seconds,graph_size,memory_used_mb\n")

    // Step 2: Load RDF files from directory
    Load loader = Load.create(graph)
    def folderPath = "/Users/freddylimpens/src/tmp/bowlogna_benchmark/BowlognaOutput"
    def directory = new File(folderPath)
    
    println "Loading RDF files from ${folderPath}..."
    def totalStartTime = System.currentTimeMillis()
    
    directory.eachFile { file ->
        if (file.name.endsWith('.nt')) {  // Filter for .nt files
            println "\nProcessing file: ${file.name}"        
            loader.parse(file.absolutePath, Loader.format.NT_FORMAT)
            def currentLoadingTime = System.currentTimeMillis() - totalStartTime
            def memoryUsed = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()
            def currentGraphSize = graph.size()

            // Write metrics to CSV
            csvFile.append("${file.name},${String.format("%.2f", currentLoadingTime/1000)},${currentGraphSize},${String.format("%.2f", memoryUsed/(1000*1000))}\n")
           
            println "RDF file loaded successfully in ${currentLoadingTime/1000} seconds!"
            println "Graph size : ${currentGraphSize } triples"
            println "Nb of threads used : ${Thread.activeCount()}"
            println "Memory used : ${(memoryUsed / (1000*1000)).round() } MB"
        }
    }

    def totalEndTime = System.currentTimeMillis()
    def memoryUsed = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()
    println "---\n Finished loading RDF files from ${folderPath} in ${(totalEndTime - totalStartTime)/1000} seconds"
    println "Total graph size : ${graph.size()} triples"
    println "Nb of threads used : ${Thread.activeCount()}"
    println "Memory used : ${(memoryUsed / (1000*1000)).round() } MB"

    // def queryStartTime = System.currentTimeMillis()
    // Step 3: Query the repository (optional)
    // String query = """
    //         PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    //         SELECT ?g (count(?s) as ?n)# 
    //         #?s ?p ?o
    //         WHERE {
    //         graph ?g{ ?s ?p ?o .}
    //         }
    //         group by ?g
    //     """

    // // Load and execute SPARQL query
    // QueryProcess exec = QueryProcess.create(graph);
    // Mappings map = exec.query(query)

    // def queryEndtTime = System.currentTimeMillis()
    // def memoryUsed = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()

    // // Print results in Markdown format
    // println("-- Query Results --") 
    // println(" Execution time: ${(queryEndtTime - queryStartTime)/1000} seconds")
    // println(ResultFormat.create(map, ResultFormat.format.JSON_FORMAT).toString())
    // println "Memory used : ${(memoryUsed / (1000*1000)).round() } MB"
    // println "Nb of threads used : ${Thread.activeCount()}"

} finally {
    // Step 5: Close the connection
    println "Goodbye!"
}