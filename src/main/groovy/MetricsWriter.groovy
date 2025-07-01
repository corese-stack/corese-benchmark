class MetricsWriter {
    final File csvFile
    final String triplestoreName

    MetricsWriter(String triplestoreName, String outDirPath) {
        this.triplestoreName = triplestoreName
        def outDir = new File(outDirPath)
        if (!outDir.exists()) {
            outDir.mkdirs()
        }

        this.csvFile = new File(outDir, "${this.triplestoreName}_loading-metrics.csv")
        
        // Write CSV header
        csvFile.write('triplestoreName,file,loading_time_seconds,graph_size,memory_used_mb\n')
    }

    void writeMetrics(String fileName, Map metrics) {
        csvFile.append("""${this.triplestoreName},${fileName},${String.format('%.2f', metrics.loadingTime)},${metrics.graphSize},${String.format('%.2f', metrics.memoryUsed)}\n""".stripIndent())
    }
}