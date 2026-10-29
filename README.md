# corese-benchmark

Benchmark framework for comparing RDF triple stores: **Corese**, **Apache Jena**, and **Eclipse RDF4J**.

## Description

This repository benchmarks Java-based RDF triple stores on loading and SPARQL query performance. Goals:

- Compare **Corese** against Apache Jena and RDF4J
- Detect **regressions** between `corese.local` (current branch) and `corese.4.x.x` (stable)
- Compare **different versions** of Corese (including `corese-next`)
- Produce JSON + CSV reports consumed by an interactive web dashboard

**Principles:**

- Java 21 harness with a rigorous measurement protocol (warmup + 3 repetitions + median)
- Memory measured as delta before/after loading with forced GC
- SPARQL query benchmark with per-query timeout and warmup
- Automatic JSON + CSV output
- Python orchestration for dataset download, build, and deployment

---

## Dashboard

The interactive benchmark dashboard is published at:
**[https://corese-stack.github.io/corese-benchmark/](https://corese-stack.github.io/corese-benchmark/)**

To view it locally:

```bash
make site   # serves at http://localhost:8080
```

**Dashboard features:**

- **Scalability charts** — when a single dataset is selected, Performance charts switch to line charts (X = graph size in triples) showing how each engine scales
- **W3C Conformance** — live pass/fail results fetched from [corese-stack.github.io/corese-w3c](https://corese-stack.github.io/corese-w3c/data/w3c-report.json) (All mode only)
- **Shareable URLs** — state (dataset, engine filter, reference engine) is encoded in the URL (`?ds=dbpedia&engines=corese.4.6.5,jena.6.2.0&ref=corese.4.6.5`)
- **Export CSV** — exports the currently filtered results directly from the browser (Full results section)
- **Engine filter** — click engine cards to filter charts; click × on pills to remove from comparison
- **SPARQL section** — per-engine latency cards, median per query, color-coded comparison table

---

## How to Run

### Prerequisites

- Java 21+
- Conda (for Python orchestration)

```bash
conda env create -f python-utils/environment.yml
conda activate benchmarkenv
```

---

### A) Detect a Corese regression (corese.local)

Main use case: compare your local branch against the stable release.

#### 1. Build corese-core locally

Inside the `corese-core` repository:

```bash
./gradlew shadowJar
```

#### 2. Run the benchmark

If `corese-core` is in the sibling directory (`../corese-core/`), the JAR is detected automatically:

```bash
conda activate benchmarkenv
cd corese-benchmark
python python-utils/workflow.py --engines corese.local,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

If `corese-core` is elsewhere, use `--coreseLocalPath`:

```bash
python python-utils/workflow.py \
  --engines corese.local,corese.4.6.5 \
  --coreseLocalPath C:\path\to\corese-core
```

#### 3. Read the result

Open `site/index.html`. The `corese.local` card shows:

- `+X% improvement` (green)
- `−X% regression` (red)

relative to `corese.4.6.5` as the fixed reference (100/100).

---

### B) Compare multiple engines

```bash
python python-utils/workflow.py --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

Default dataset: `dbpedia`. To change:

```bash
python python-utils/workflow.py --engines corese.4.6.5,jena.6.2.0 --dataset bowlogna
```

---

### C) Compare Corese versions

One build per Corese version:

```bash
python python-utils/workflow.py --coreseVersions 4.6.5,4.6.3
```

---

### D) Compare Corese commits

Clones, checks out, and compiles each commit from GitHub:

```bash
python python-utils/workflow.py --coreseCommits a17f3d6,b089a03
```

---

### E) Benchmark with SPARQL queries

For datasets that have associated queries (Bowlogna, BSBM):

```bash
python python-utils/workflow.py --engines corese.local,corese.4.6.5 --dataset bowlogna
```

The **SPARQL Queries** section appears in the dashboard with:

- Per-engine latency cards: avg, p50, p95, p99
- Median time per query and per engine
- Color-coded comparison table (green = best, orange = ×5–19, red = ×20+)
- `—` indicates timeout or error

---

### F) Resume mode

Resume mode runs one engine × one dataset at a time and skips combinations whose output already contains a valid JSON report. Useful for long runs that may be interrupted:

```bash
python python-utils/workflow.py \
  --engines corese.local,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2 \
  --datasets dbpedia,bowlogna,bsbm,lubm \
  --resume
```

Partial or empty JSON files are automatically re-run (not skipped).

### G) Baseline reference mode (< 5-min CI runs)

To eliminate redundant re-computation of immutable Maven releases (Corese 4.6.5, Apache Jena 6.2.0, Eclipse RDF4J 5.3.2), benchmark measurements are frozen in `site/data/baseline.json`.

During development, `workflow.py` automatically detects baseline-eligible engines and reuses their frozen scores, evaluating only the dynamic in-development engine (`corese.next` or `corese.local`):

```bash
# Evaluates ONLY corese.next, merging baseline engines in < 5 minutes
python python-utils/workflow.py \
  --engines corese.next,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2 \
  --datasets dbpedia,bowlogna,lubm,bsbm

# Force full re-run of all engines from scratch (bypassing baseline)
python python-utils/workflow.py \
  --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2 \
  --datasets dbpedia,bowlogna,lubm,bsbm \
  --force-all-engines

# Re-evaluate immutable engines and update site/data/baseline.json
python python-utils/workflow.py \
  --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2 \
  --datasets dbpedia,bowlogna,lubm,bsbm \
  --update-baseline
```

### Workflow options

| Option | Default | Description |
| -------- | --------- | ------------- |
| `--engines` | — | Comma-separated engine list (e.g. `corese.4.6.5,jena.6.2.0`) |
| `--dataset` | `dbpedia` | Single dataset: `dbpedia`, `bowlogna`, `bsbm`, `lubm` |
| `--datasets` | — | Multiple datasets in one run (e.g. `dbpedia,bowlogna`) |
| `--scales` | `small,medium,large` | Scale tiers for synthetic datasets |
| `--baseline` | `site/data/baseline.json` | Path to frozen reference baseline JSON |
| `--force-all-engines` | off | Bypass baseline and force fresh execution of all engines |
| `--update-baseline` | off | Update baseline.json with newly measured engine scores |
| `--resume` | off | Skip already-completed engine × dataset pairs |
| `--quick` | off | 1 repetition instead of 3 (faster, less accurate) |
| `--query-timeout` | `30` | Per-query SPARQL timeout in seconds |
| `--inference` | off | Enable RDFS inference for Corese engines |
| `--coreseLocalPath` | auto | Path to corese-core project or JAR |
| `--dataDir` | `./input` | Custom data directory |

---

### Run the Java harness directly

```bash
# Build
./gradlew clean build -PcoreseVersion=4.6.5 -PjenaVersion=6.2.0 -Prdf4jVersion=5.3.2

# Run (without queries)
./gradlew runBenchmark --args="input/dbpedia/unzip out/json/report.json corese.4.6.5,jena.6.2.0 dbpedia"

# Run (with queries)
./gradlew runBenchmark --args="input/dbpedia/unzip out/json/report.json corese.4.6.5 dbpedia queries.txt"

# Run with custom query timeout (60s)
./gradlew runBenchmark --args="input/dbpedia/unzip out/json/report.json corese.4.6.5 dbpedia queries.txt --query-timeout 60"
```

---

## Outputs

Each run automatically generates:

| File | Description |
| ------ | ------------- |
| `out/json/<timestamp>_<engines>.json` | Full report (loaded by the dashboard) |
| `out/csv/<timestamp>_<engines>.csv` | Same data in CSV format (Excel, etc.) |
| `site/data/benchmark-report.json` | Copy of the latest report (current dashboard) |
| `site/data/benchmark-report.csv` | Copy of the latest CSV (download button) |

---

## Measurement Protocol

### Load benchmark

For each file and each engine:

1. **Warmup** — load → clear → GC (result discarded)
2. **3 repetitions**:
   - Forced GC + memory snapshot before
   - Load file
   - Forced GC + memory snapshot after
   - Record time and memory delta
3. **Keep the median** of the 3 repetitions

### SPARQL benchmark

For each query and each engine:

1. **Warmup** — one execution discarded (primes JIT); logs result count with `WARN` if 0 results
2. **3 repetitions** with per-execution timeout (default 30s, configurable via `--query-timeout`)
3. Each rep runs in a **daemon thread** via `ExecutorService` — a stuck query is abandoned without blocking subsequent queries
4. **Keep the median** of the 3 repetitions (`—` if all reps timed out)

This protocol ensures reproducible results by eliminating JIT compilation bias and GC timing noise.

**Note on `clear()`:** RDF4J performs a full repository reinitialisation between repetitions (rather than just `conn.clear()`) to release internal SAIL memory structures and avoid negative memory delta artefacts caused by delayed GC.

---

## Metrics

| Metric | Description |
| -------- | ------------- |
| `loadingTimeMs` | Median loading time over 3 repetitions (ms) |
| `throughputTriplesPerSec` | Triples loaded per second |
| `memoryDeltaMb` | Memory consumed by loading (after − before GC, MB) |
| `cpuPercent` | JVM CPU usage during loading (via `OperatingSystemMXBean`) |
| `repetitionsMs` | Raw values of the 3 repetitions (for transparency) |

---

## Datasets

### DBpedia sample

5 files sampled from the [DBpedia 3.5.1 dump](https://downloads.dbpedia.org/3.5.1/en/):

- `category_labels_en.nt`
- `disambiguations_en.nt`
- `homepages_en.nt`
- `persondata_en.nt`
- `specific_mappingbased_properties_en.nt`

```bash
python python-utils/workflow.py --dataset dbpedia --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

### Bowlogna

Synthetic dataset describing student/university relations. Includes associated **SPARQL queries** for latency benchmarking. Source: [DICE Research / HOBBIT](https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip)

Dashboard note: Bowlogna shows only the **SPARQL** section (no Performance/Load charts — the dataset is optimised for query benchmarking).

| Scale | Departments | Triples (approx.) |
| ------- | ------------- | ------------------- |
| `small` | 1 | ~1.2 M |
| `medium` | 5 | ~6 M |
| `large` | 10 | ~12 M |

```bash
python python-utils/workflow.py --dataset bowlogna --scales small --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

```bash
python python-utils/workflow.py --dataset bsbm --scales small,medium --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

### LUBM

Lehigh University Benchmark — university domain with RDFS reasoning potential. Generated with [UBA 1.7](https://swat.cse.lehigh.edu/projects/lubm/).

| Scale | Universities | Triples (approx.) |
| ------- | ----------- | ------------------- |
| `small` | 1 | ~100 K |
| `medium` | 10 | ~1 M |
| `large` | 100 | ~10 M |

```bash
python python-utils/workflow.py --dataset lubm --scales small --engines corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
```

---

## Engines

| Engine | Default version | Notes |
| -------- | ---------------- | ------- |
| Corese | 4.6.5 | Use `corese.local` to benchmark a local branch |
| Corese 5 (next) | local JAR | `corese.next` — uses the new `Repositories`/`RepositoryConnection` API. Requires a Corese 5 JAR in `libs/` and `--coreseLocalPath` or sibling `corese-core/`. |
| Apache Jena | 6.2.0 | |
| Eclipse RDF4J | 5.3.2 | Malformed IRIs are skipped with a WARN log (DBpedia `homepages_en.nt` contains ~300 invalid IPv4 URIs) |

---
