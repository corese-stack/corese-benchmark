// Main execution

if (args.length < 3) {
    println "Error: Please provide the directory, a comma-separated list of triplestore names, and the output directory as arguments."
    println "Usage: groovy benchmark.groovy <directory> <outDir> <triplestore1,triplestore2,...> "
    System.exit(1)
}

String processDirectory = args[0]
String outDirPath = args[1]
String triplestoreArg = args[2]
List<String> triplestoreNames = triplestoreArg.split(',').collect { it.trim() }


try {
    println "Processing directory: ${processDirectory}"
    println "Triplestores to benchmark: ${triplestoreNames.join(', ')}"

    for (String triplestoreName in triplestoreNames) {
        try {
            println "Starting benchmark for ${triplestoreName}..."
            // Call garbage collector to free memory
            System.gc()
            println "Garbage collector invoked."
            def benchmark = new RDFBenchmark(triplestoreName, outDirPath)
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
