import java.io.File
import java.text.SimpleDateFormat
import fr.inria.corese.core.Graph
import fr.inria.corese.core.load.Load
import fr.inria.corese.core.api.Loader

class RDFBenchmark {

    final String triplestoreName
    final Graph graph
    final Load loader
    final MetricsWriter metricsWriter

    RDFBenchmark(String triplestoreName) {
        this.triplestoreName = triplestoreName
        this.graph = Graph.create()
        this.loader = Load.create(graph)
        this.metricsWriter = new MetricsWriter(triplestoreName)
    }

    void processDirectory(String folderPath) {
        def directory = new File(folderPath)
        println "Loading RDF files from ${folderPath}..."
        def totalStartTime = System.currentTimeMillis()

        directory.eachFile { file ->
            if (file.name.endsWith('.nt')) {
                processFile(file, totalStartTime)
            }
        }

        printFinalStats(folderPath, totalStartTime)
    }

    private void processFile(File file, long startTime) {
        println "\nProcessing file: ${file.name}"
        loader.parse(file.absolutePath, Loader.format.NT_FORMAT)

        def metrics = calculateMetrics(startTime)
        metricsWriter.writeMetrics(file.name, metrics)
        printFileStats(metrics)
    }

    private Map calculateMetrics(long startTime) {
        def currentTime = System.currentTimeMillis()
        return [
            loadingTime: (currentTime - startTime) / 1000,
            graphSize: graph.size(),
            memoryUsed: (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()) / (1000 * 1000),
            threadsCount: Thread.activeCount()
        ]
    }

    private void printFileStats(Map metrics) {
        println "RDF file loaded successfully in ${String.format('%.2f', metrics.loadingTime)} seconds!"
        println "Graph size: ${metrics.graphSize} triples"
        println "Threads used: ${metrics.threadsCount}"
        println "Memory used: ${String.format('%.2f', metrics.memoryUsed)} MB"
    }

    private void printFinalStats(String folderPath, long startTime) {
        def metrics = calculateMetrics(startTime)
        println """
            ---
            Finished loading RDF files from ${folderPath} in ${String.format('%.2f', metrics.loadingTime)} seconds
            Total graph size: ${metrics.graphSize} triples
            Threads used: ${metrics.threadsCount}
            Memory used: ${String.format('%.2f', metrics.memoryUsed)} MB
            Metrics written to ${metricsWriter.csvFile.absolutePath}
            -------------------------------------
        """.stripIndent()
    }
}

class MetricsWriter {
    final File csvFile

    MetricsWriter(String triplestoreName) {
        def outDir = new File("out")
        if (!outDir.exists()) {
            outDir.mkdir()
        }

        def timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss").format(new Date())
        this.csvFile = new File(outDir, "${triplestoreName}_loading-metrics-${timestamp}.csv")
        
        // Write CSV header
        csvFile.write('triplestoreName,file,loading_time_seconds,graph_size,memory_used_mb\n')
    }

    void writeMetrics(String fileName, Map metrics) {
        csvFile.append("""
            ${triplestoreName},${fileName},
            ${String.format('%.2f', metrics.loadingTime)},
            ${metrics.graphSize},
            ${String.format('%.2f', metrics.memoryUsed)}\n
        """.stripIndent())
    }
}

// Main execution
try {
    def benchmark = new RDFBenchmark("corese4.6.3")
    benchmark.processDirectory('/Users/freddylimpens/src/tmp/bowlogna_benchmark/sample')
} catch (Exception e) {
    println "Error occurred: ${e.message}"
    throw e
} finally {
    println "Goodbye!"
    System.exit(0) 

}