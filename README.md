# corese-benchmark

## Description 

This repository offers some tools and utilities to run a benchmark of a set of java-based triple stores, namely Corese, RDF4J and Jena. Its aim is to 
- compare Corese with the other triplestore
- compare different versions of Corese

Its principles are
* Focusing on performance measurements, such as loading time, memory used, query time, number of threads/CPU, etc.
* Using native core java libraries instead of server versions of the triplestore. The code is written in Groovy, which is one of java's scripting language available.  
* Producing reusable CSV exports of the performance measurements that can be used in other contexts. 
* Building upon existing RDF or SPARQL benchmarks such as
    * Bowlogna SPARQL Benchmark
    * BSBM Berlin SPARQL Benchmark
    * DBPedia datasets
    * etc.
  
## Links to dashboard

* The minisite with dynamic versions of the plots is available at [https://corese-stack.github.io/corese-benchmark/](https://corese-stack.github.io/corese-benchmark/)
* You can also have a look at the image version of the plots in the [dashboard](./dashboard/README.md) folder. See below [HOW TO run it](#how-to-run-it) section to run locally the benchmark and generate a new version of the plots.


## Organisation of the repository

There are 2 main parts of the code:
* The groovy/java code 
  * is versionned in `src` folder
  * processes the input data using the 3 triplestores : loading, and querying (WIP)
  * saves the CSV containing the measurements in the `out` folder. Examples of previous run are already given.
* workflow automation code written in Python, and versionned in `python-utils` folder. The main steps automatized are :
    * 1) creating `input` folder, downloading and saving input data in it
    * 2) launching the `benchmark.groovy` script
    * 3) launching the `plot-compare.py` script which saves the plot files in `public` folder 
* 2 versions of the workflow  are available:
  * `workflow.py` to compare 3 given versions of the 3 triplestores 
  * `workflow-corese-versions.py` to compare 2 or more given version of Corese. 

* The latest results that we version in this repo are visible in the [dashboard](./dashboard/README.md) folder. If you run it by yourself, updated plots will be saved in this folder.

## HOW TO run it


### Run the workflow.py automation script 

The benchmark's workflow is implemented as a Python script.

* 1st install dependencies defined in [python-utils/environment.yml](./python-utils/environment.yml) using conda => see [python-utils](./python-utils/README.md)
* activate python environment 
```bash
conda activate benchmarkenv
(benchmarkenv)cd python-utils
```

Once the dependencies installed, you have to choose between 3 ways to use it (see output examples in the [dashboard_examples](./example_outputs/dashboard_examples/) to see examples results for one of each way)


####  A) launch the script with triplestore names

You can specify your own combination of versions for each of the three supported triplestores, with the argument `--triplestoreNames` :

```bash
# with 2 
(benchmarkenv)python workflow.py --triplestoreNames="jena.4.10.0,corese.4.6.3"
# Or with 3
(benchmarkenv)python workflow.py --triplestoreNames="rdf4j.5.1.2,jena.5.4.0,corese.4.6.2"
```

* The given  `--triplestoreNames` parameter is a comma-separated list of triplestore names and versions (e.g., 'rdf4j.5.1.2,jena.5.4.0,corese.4.6.3'). 
* Each name should be in the format 'name.version'. where 'name' is one of 'rdf4j', 'corese', or 'jena' and 'version' is the version number (e.g., '5.1.2', '4.6.3', '4.10.0').",
* This version of the script compiles the groovy benchmark only once;
* Each combination can only contain one version of a triplestore. Eg 'jena.5.10.0,jena.5.4.0,corese.4.6.3' is not a valid combination.

####  B) launch the script with corese versions names

This version of the workflow tests only differet versions of corese, one of which can be a local compiled jar.

```bash
(benchmarkenv)python workflow.py --coreseVersions="4.6.2,4.6.3"
# OR 
(benchmarkenv)python workflow.py --coreseVersions="4.0.1,4.6.3,local"
```

* You can test any tagged and released on Maven version of Corese this way
* if you want to include a local version:
  -  add "local" in the coreseVersions list
  -  put the jar of the corese-core version in a directory at the root of the project that you have to name as "libs" and create if not existing.

####  C) launch the script with corese-core's repository commit hashes 

This version of the workflow allows to compare different versions of Corese only, but at a finer granularity, the commits of the github repository:

```bash
(benchmarkenv)python workflow.py --coreseCommits='a17f3d6,b089a03,6efa666' 
# OR 
(benchmarkenv)python workflow.py --coreseCommits='a17f3d6,b089a03' 
```

* You can test any [commit](https://github.com/corese-stack/corese-core/commits/a17f3d60846db6794b12f723888c7c12ceef4cd7/) of the [corese-core github repository](https://github.com/corese-stack/corese-core) this way. 
* For each commit hash provided in the list, the script downloads the whole repository code of Corese-Core and compiles it before running the benchmark itself 


### Run the benchmark.groovy alone

* 1st build the execution environement

```bash
./gradlew  clean build
```
* then run it without forgetting to give the path to the input directory, the path to the output directory, and the list of triplestore names, eg:

```bash
./gradlew runGroovyScript --args="/path/to/directory /path/to/outdirectory rdf4j.5.1.2,jena.4.10.0,corese.4.6.3"
```

### Run the plot-compare.py alone

Assuming the python environment `benchmarkenv` has been actived:
```bash
(benchmarkenv)cd python-utils
(benchmarkenv)python plot-compare.py
# or optionaly indicating the folder to read the CSV files from
(benchmarkenv)python plot-compare.py outputdirectory
```

It will loop throught the content of the given directory and plots the loading time and memory usage and generate 
- a png and html version of the plot
- a index.html file to be used as the dashboard 

## Datasets 

### Bowlogna

* Bowlogna becnhmark dataset (from [this link](https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip))
* Synthetic dataset built according a model describing relations between students, universities, and course programs. 
* It's made of 10 files, formally equivalent, but containing each different data. Each file loaded adds ~1.2 million triples
* Total size ~12 Millions triples
* Reference article : [SIMPDA2011 paper](https://exascale.info/assets/pdf/BowlognaBenchSIMPDA2011.pdf)

### DBPedia sample

* DBPedia is an RDF translation effort of Wikipedia
* We sampled 10 files from the dump folder available online : https://downloads.dbpedia.org/3.5.1/en/
  - redirects_en.nt
  - disambiguations_en.nt
  - homepages_en.nt
  - geo_coordinates_en.nt
  - instance_types_en.nt
  - category_labels_en.nt
  - skos_categories_en.nt
  - images_en.nt
  - specific_mappingbased_properties_en.nt
  - persondata_en.nt
* total size is ~20 Millions triples

## Metrics for measuring and comparing triple stores performance

* Memory consumption :
    * heap : max available to the JVM
    * used : used memory (or "used heap") to be measured after gc (garbage collector) call
        * see : https://stackoverflow.com/questions/10754748/monitoring-own-memory-usage-by-java-application
    * calculate the delta of used mem before and after the processes to be tested  
        * after    startup
        * before loading data
        * after data is loaded
        * after query exec

* Time of execution
    * function to use `System.currentTimeMillis()`.  Call before and after the process
    * what time to measure ?
        * loading data 
        * SPARQL query 
            * select 
            * count 

* Thread : bound to a series of JVM parameters (max, etc)
    * nb of threads actually used => Thread.activeCount() (see [here](https://www.baeldung.com/java-get-number-of-threads))
    * other instropection methods from : 
        * [`com.sun.management.OperatingSystemMXBean`](https://docs.oracle.com/en/java/javase/15/docs/api/jdk.management/com/sun/management/OperatingSystemMXBean.html)
        * [ThreadMXBean.html](https://docs.oracle.com/en/java/javase/15/docs/api/jdk.management/com/sun/management/ThreadMXBean.html)

* CPU usage : (NTH-WIP)
    * see  : https://stackoverflow.com/questions/63948968/how-to-get-cpu-utilization-using-java-11

* Nb of infered triples (NTH-WIP) : 
    * look the named graph used for infered 

## Typical Configuration used

* inMemoryStore 
* inference level (check if levels are comparable) :
    * no inference
    * RDFS 
* format to be parsed :
    * nt
    * turtle
    * trig 




## Designing test suite for RDF parsers

W3C turtle test suite: https://www.w3.org/2011/rdf-wg/wiki/Turtle_Test_Suite

W3C JSON-LD test suite: https://w3c.github.io/json-ld-api/tests/

W3C Trig test suite: https://www.w3.org/2013/TrigTests/

W3C NTriples test suite: https://www.w3.org/2013/N-TriplesTests/

W3C RDF/XML test suite: https://www.w3.org/2013/RDFXMLTests/

W3C NQuads test suite: https://www.w3.org/2013/N-QuadsTests/
