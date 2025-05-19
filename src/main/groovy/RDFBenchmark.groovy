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

        directory.eachFileRecurse { file ->
            if (file.name.endsWith('.nt')) {
                try {
                    processFile(file, totalStartTime)
                } catch (Exception e) {
                    println "Error processing file ${file.name}: ${e.message}"
                }
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
