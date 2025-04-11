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

### Run the plot-compare.py alone

Assuming the python environment `benchmark_env` has been actived:
```bash
(benchmark_env)cd python-utils
(benchmark_env)python plot-compare.py
```
