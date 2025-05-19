// Main execution
try {
    if (args.length < 2) {
        println "Error: Please provide the directory and a comma-separated list of triplestore names as arguments."
        println "Usage: groovy benchmark.groovy <directory> <triplestore1,triplestore2,...>"
        System.exit(1)
    }

    String processDirectory = args[0]
    String triplestoreArg = args[1]
    List<String> triplestoreNames = triplestoreArg.split(',').collect { it.trim() }

    println "Processing directory: ${processDirectory}"
    println "Triplestores to benchmark: ${triplestoreNames.join(', ')}"

    for (String triplestoreName in triplestoreNames) {
        try {
            println "Starting benchmark for ${triplestoreName}..."
            // Call garbage collector to free memory
            System.gc()
            println "Garbage collector invoked."
            def benchmark = new RDFBenchmark(triplestoreName)
            benchmark.processDirectory(processDirectory)
            Thread.sleep(1000)
        } catch (Exception e) {
            println "Error during benchmark for ${triplestoreName}: ${e.message}"
        }
    }
} catch (Exception e) {
    println "Error occurred: ${e.message}"
    throw e  
} finally {
    println "Goodbye!"
    System.exit(0)
}
