# Python code for the Corese-Benchmark


## Intro

Objectives => workflow automation : 

1. downloading and saving input files 
2. launch groovy benchmark
3. read CSV output files and plot the results (datavis)

## How to install dependencies

NB :  dependencies described in [environment.yml](./environment.yml)

1. install conda, see [here](https://docs.conda.io/en/latest/miniconda.html)
2. create the environment ; first time only

```bash
conda env create -f environment.yml
```

3. activate the environment

```bash
conda activate benchmark_env
```

4. when you add new dependencies, you need to update the environment.yml file and re-run the above command: 

```bash
conda env update -f environment.yml
```

## How to run
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

By default the benchmark will run on the following triplestores


But you can specify your own combination of versions for one, two, or the three supported triplestores, with the argument `--triplestoreNames` :
* default values = "rdf4j.5.1.2,jena.5.4.0,corese.4.6.3"
* description : Comma-separated list of triplestore names and versions (e.g., 'rdf4j.5.1.2,jena.5.4.0,corese.4.6.3'). Each name should be in the format 'name.version'. where 'name' is one of 'rdf4j', 'corese', or 'jena' and 'version' is the version number (e.g., '5.1.2', '4.6.3', '4.10.0').",
* example usage, Assuming the python environment `benchmark_env` has been actived:

```bash
(benchmark_env)python workflow.py --triplestoreNames="jena.4.10.0,corese.4.6.3"
(benchmark_env)python workflow.py --triplestoreNames="rdf4j.5.1.2,jena.5.4.0,corese.4.6.2"

```

### Run the plot-compare.py alone

This can be useful if you already have CSV outputs from different run of the groovy script, and you want to plot them together. Assuming the python environment `benchmark_env` has been actived:

```bash
(benchmark_env)cd python-utils
(benchmark_env)python plot-compare.py
```
