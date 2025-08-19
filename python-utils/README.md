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
conda activate benchmarkenv
```

4. when you add new dependencies, you need to update the environment.yml file and re-run the above command: 

```bash
conda env update -f environment.yml
```

## How to run

See [main README](../README.md)

