import java.io.File
import java.text.SimpleDateFormat

import fr.inria.corese.core.Graph
import fr.inria.corese.core.load.Load
import fr.inria.corese.core.api.Loader


// Step 1: Create a graph object
Graph graph = Graph.create()
def triplestoreName = "corese4.6.3" // Replace with your triplestore name

try {
    // Create output directory and CSV file
    def outDir = new File("out")
    if (!outDir.exists()) {
        outDir.mkdir()
    }

    // Create CSV file with timestamp
    def timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss").format(new Date())
    def csvFile = new File(outDir, "${triplestoreName}_loading-metrics-${timestamp}.csv")

    // Write CSV header
    csvFile.write('triplestoreName,file,loading_time_seconds,graph_size,memory_used_mb\n')

    // Step 2: Load RDF files from directory
    Load loader = Load.create(graph)
    //def folderPath = '/Users/freddylimpens/src/tmp/bowlogna_benchmark/BowlognaOutput'
    def folderPath = '/Users/freddylimpens/src/tmp/bowlogna_benchmark/sample'
    def File directory = new File(folderPath)

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
            csvFile.append(
                "${triplestoreName},${file.name}," +
                "${String.format('%.2f', currentLoadingTime / 1000)}," +
                "${currentGraphSize}," +
                "${String.format('%.2f', memoryUsed/(1000 * 1000))}\n"
            )

            println "RDF file loaded successfully in ${currentLoadingTime / 1000} seconds!"
            println "Graph size : ${currentGraphSize } triples"
            println "Nb of threads used : ${Thread.activeCount()}"
            println "Memory used : ${(memoryUsed / (1000 * 1000)).round() } MB"
        }
    }

    def totalEndTime = System.currentTimeMillis()
    def memoryUsed = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()
    println "---\n Finished loading RDF files from ${folderPath} in ${(totalEndTime - totalStartTime)/1000} seconds"
    println "Total graph size : ${graph.size()} triples"
    println "Nb of threads used : ${Thread.activeCount()}"
    println "Memory used : ${(memoryUsed / (1000*1000)).round() } MB"
    println "Metrics written to ${csvFile.absolutePath}"
    println "-------------------------------------"

} finally {
    // Step 5: Close the connection
    println "Goodbye!"
}