# corese-benchmark

Benchmark suite comparing **Corese**, **Apache Jena**, and **Eclipse RDF4J** on RDF ingestion and SPARQL 1.1 query execution.

## Architecture & Principles

- **Java 25 harness** running each engine in an isolated child JVM (`-Xms4g -Xmx8g`) to eliminate JIT and GC cross-contamination.
- **Loading protocol**: 1 warmup load (discarded) followed by 3 measured repetitions; reports median latency, throughput, retained heap delta (`System.gc()` before/after), disk footprint, and JVM heap telemetry.
- **SPARQL protocol**: curated v1 catalogue ([catalogue.json](input/queries/v1/catalogue.json)) across 5 datasets, 1 warmup + 3 timed repetitions per query, deferred semantic result hashing (`PASS`, `MISMATCH`, `INCONCLUSIVE` on blank nodes, `TIMEOUT`, `ERROR`).
- **Modular Python orchestrator** (`workflow_cli.py`, `workflow_runner.py`, `workflow_reports.py`, `baseline.py`) handling dataset generation, filtered W3C format conversion, multi-version Gradle batching, and frozen immutable baseline reuse.

## Dashboard

Published at **[corese-stack.github.io/corese-benchmark](https://corese-stack.github.io/corese-benchmark/)**. To preview locally:

```bash
make site   # http://localhost:8080
```

- **RDF Loading** (`#loading`, default dataset `bowlogna`): throughput, retained heap, on-disk footprint, ingestion heap telemetry, and full observation table with status badges (`OOM`, `TIMEOUT`, `ERROR`, `MISSING`).
- **SPARQL Features** (`#sparql`): 9 SPARQL feature axes, cross-engine validation statuses, sortable query details, inline query source viewer, and protocol reproducibility cards.
- **Shareable URLs**: `?dataset=bsbm&engines=corese.next,corese.4.6.5,jena.6.2.0,rdf4j.6.1.0#loading` or `#sparql`.

## Quick Start

### Prerequisites

- **Java 25+**
- **Conda** (`python-utils/environment.yml`)
- **Node.js 20+** (only for dashboard unit/browser tests)

```bash
conda env create -f python-utils/environment.yml
conda activate benchmarkenv
```

### Common Runs

```bash
# Compare local corese-core build against stable references (auto-detects ../corese-core/)
python3 python-utils/workflow.py --engines corese.local,corese.4.6.5,jena.6.2.0,rdf4j.6.1.0 --datasets bowlogna

# Fast single-format iteration during development (skips baseline reuse & site/data export)
python3 python-utils/workflow.py --engines corese.local --datasets lubm --formats nt --mode load --quick
make dev ENGINES=corese.local DATASETS=lubm FORMATS=nt MODE=load

# Multiple versions of the same engine family (automatically split into minimal Gradle batches)
python3 python-utils/workflow.py --engines corese.next,corese.4.6.5,corese.4.6.4,jena.6.2.0 --datasets dbpedia

# Re-evaluate every engine without baseline reuse
python3 python-utils/workflow.py --engines corese.4.6.5,jena.6.2.0,rdf4j.6.1.0 --datasets bowlogna,bsbm --reuse none
```

### Workflow Options

| Option | Default | Description |
| --- | --- | --- |
| `--engines` | required | Comma-separated engine IDs (supports multiple versions per family) |
| `--datasets` | `dbpedia` | CSV subset of `dbpedia`, `bsbm`, `lubm`, `bowlogna`, `named-graphs` |
| `--formats` | all canonical | CSV subset of `nt`, `nq`, `ttl`, `trig`, `rdf`, `jsonld` (aliases accepted) |
| `--mode` | `all` | `all` (load + query), `load`, or `query` |
| `--quick` | off | 1 repetition without warmup |
| `--inference` | off | Enable OWL-RL inference for Corese drivers |
| `--baseline` | `site/data/baseline.json` | Path to frozen immutable baseline JSON |
| `--reuse` | `baseline` | `baseline` or `none` |
| `--update-baseline` | off | Refresh immutable runs in baseline (requires full formats, `--mode all`, export enabled, no `--quick` / `--inference`) |
| `--no-export` | off | Do not overwrite `site/data/` |
| `--data-dir` | auto | Custom root directory containing `input/` and `out/` |
| `--corese-local-path` | auto | Path to `corese-core` checkout or JAR for `corese.local` / `corese.next` |

Run `make help` for predefined targets (`regression`, `compare`, `next`, `versions`, `corese-all`, `bowlogna`, `lubm`, `bsbm`, `all`, `dev`, `site`). `FORMATS` is unset by default (all canonical formats).

### Direct Java Harness

```bash
# Build for specific versions
./gradlew clean build -PcoreseVersion=4.6.5 -PjenaVersion=6.2.0 -Prdf4jVersion=6.1.0

# Run with optional --formats and --mode
./gradlew runBenchmark --args="input/lubm/view_canonical out/json/report.json corese.4.6.5,jena.6.2.0 lubm input/queries/v1/catalogue.json --formats nt,ttl --mode load"

# Convert N-Triples selectively
./gradlew convertDatasets --args="input/lubm/view_canonical --formats=ttl,jsonld"
```

## Outputs

| File | Description |
| --- | --- |
| `out/json/<timestamp>_report.json` | Combined run report |
| `out/logs/<timestamp>.log` | Execution log |
| `site/data/benchmark-report.json` | Exported dashboard report (unless `--no-export` or partial `--formats`) |
| `site/data/benchmark-report.csv` | Exported CSV table matching `benchmark-report.json` |

## Datasets & Engines

| Dataset | Content | Prepared inputs |
| --- | --- | --- |
| `bowlogna` | BowlognaBench department dump | `Department0.nt` |
| `bsbm` | Berlin SPARQL Benchmark e-commerce synthetic graphs | medium (5k products) for loading; small (1k) for queries |
| `dbpedia` | English DBpedia 3.5.1 persondata | `persondata_en.nt` |
| `lubm` | Lehigh University Benchmark generated with UBA 1.7 | medium (10 universities) for loading; small (1) for queries |
| `named-graphs` | 2-graph N-Quads partition derived from `lubm_small` | derived from `lubm` `small` |

| Engine | Default / Baseline Versions | Variants |
| --- | --- | --- |
| Corese | `4.6.5`, `4.6.4`, `corese.local`, `corese.next` | in-memory (`corese.next` requires JAR in `libs/`) |
| Apache Jena | `6.2.0`, `6.1.0` | in-memory, `.tdb2` |
| Eclipse RDF4J | `6.1.0`, `5.3.2` | in-memory, `.native`, `.lmdb` |

## Verification

```bash
./gradlew test
python3 -m unittest discover -s python-utils/tests -p "test_*.py" -v
node --test site/tests/*.test.mjs
```
