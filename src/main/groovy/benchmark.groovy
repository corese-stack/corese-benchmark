import java.io.File
import java.text.SimpleDateFormat

class RDFBenchmark {

    final String triplestoreName
    final RDFLoader loader
    final MetricsWriter metricsWriter

    RDFBenchmark(String triplestoreName) {
        this.triplestoreName = triplestoreName
        this.loader = RDFLoaderFactory.createLoader(triplestoreName)
        this.loader.init()
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
        loader.loadFile(file.absolutePath)

        def metrics = calculateMetrics(startTime)
        metricsWriter.writeMetrics(file.name, metrics)
        printFileStats(metrics)
    }

    private Map calculateMetrics(long startTime) {
        def currentTime = System.currentTimeMillis()
        return [
            loadingTime: (currentTime - startTime) / 1000,
            graphSize: loader.getGraphSize(),
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
    final String triplestoreName

    MetricsWriter(String triplestoreName) {
        this.triplestoreName = triplestoreName
        def outDir = new File("out")
        if (!outDir.exists()) {
            outDir.mkdir()
        }

        //def timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss").format(new Date())
        //this.csvFile = new File(outDir, "${this.triplestoreName}_loading-metrics-${timestamp}.csv")
        this.csvFile = new File(outDir, "${this.triplestoreName}_loading-metrics.csv")
        
        // Write CSV header
        csvFile.write('triplestoreName,file,loading_time_seconds,graph_size,memory_used_mb\n')
    }

    void writeMetrics(String fileName, Map metrics) {
        csvFile.append("""${this.triplestoreName},${fileName},${String.format('%.2f', metrics.loadingTime)},${metrics.graphSize},${String.format('%.2f', metrics.memoryUsed)}""".stripIndent())
    }
}

// Main execution
try {
    def benchmark = new RDFBenchmark("corese.4.6.3")
    //def benchmark = new RDFBenchmark("rdf4j.5.1.2")
    //benchmark.processDirectory('/Users/freddylimpens/src/tmp/bowlogna_benchmark/sample')
    benchmark.processDirectory('/Users/freddylimpens/src/tmp/bowlogna_benchmark/BowlognaOutput')
} catch (Exception e) {
    println "Error occurred: ${e.message}"
    throw e
} finally {
    println "Goodbye!"
    System.exit(0) 

}