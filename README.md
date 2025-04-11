# corese-benchmark

## Description 

This repository offers some tools and utilities to run a benchmark of a set of java-based triple stores, namely Corese, RDF4J and Jena.

Its principles are
* Focusing on performance measurements, such as loading time, memory used, query time, number of threads/CPU, etc.
* Using native core java libraries instead of server versions of the triplestore. The code is written in Groovy, which is one of java's scripting language available.  
* Producing reusable CSV exports of the performance measurements that can be used in other contexts. 
* Built upon existing RDF or SPARQL benchmarks such as
    * Bowlogna SPARQL Benchmark
    * BSBM Berlin SPARQL Benchmark
    * DBPedia datasets
    * etc.
  
## Organisation of the repository

There are 2 main parts of the code:
* The groovy/java code 
  * versionned in `src` folder
  * do the input data processing using the 3 triplestores : loading, and querying (WIP)
  * saves the CSV containing the measurements in the `out` folder 
* datavisualization and workflow automation code
  * written in Python
  * versionned in `python-utils` folder
  * the `workflow.py` goes through the following steps:
    * creating `input` folder, downloading and saving input data in it
    * launching the `benchmark.groovy` script
    * launching the `plot-compare.py` script which saves the plot files in `public` folder 

* The latest results that we version in this repo are visible in the [public](./public/README.md) folder. If you run it by yourself, updated plots will be saved in this folder.

## HOW TO run it

### Run the workflow.py automation script 

* 1st install dependencies defined in [python-utils/environment.yml](./python-utils/environment.yml) using conda => see [python-utils](./python-utils/README.md)
* activate python environment 
```bash
conda activate benchmark_env
```
* launch the script
```bash
(benchmark_env)cd python-utils
(benchmark_env)python workflow.py
```


### Run the benchmark.groovy alone

* 1st build the execution environement

```bash
./gradlew  clean build
```
* then run it without forgetting to give the path to the input directory

```bash
./gradlew runGroovyScript --args="/path/to/directory"
```

### Run the plot-compare.py alone

Assuming the python environment `benchmark_env` has been actived:
```bash
(benchmark_env)cd python-utils
(benchmark_env)python plot-compare.py
```

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

## Datasets used



