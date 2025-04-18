// Main execution
try {
    if (args.length == 0) {
        println "Error: No directory provided. Please provide the directory to process as an argument."
        System.exit(1)
    }

    String processDirectory = args[0]
    println "Processing directory: ${processDirectory}"

    for (String triplestoreName in [
        "rdf4j.5.1.2", 
        "jena.4.10.0",
        "corese.4.6.3" 
        ]) {
        println "Starting benchmark for ${triplestoreName}..."
        // Call garbage collector to free memory
        System.gc()
        println "Garbage collector invoked."
        def benchmark = new RDFBenchmark(triplestoreName)
        benchmark.processDirectory(processDirectory)
        Thread.sleep(1000)
    }
} catch (Exception e) {
    println "Error occurred: ${e.message}"
    throw e  
} finally {
    println "Goodbye!"
    System.exit(0) }
