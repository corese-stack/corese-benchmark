# Benchmark Audit Report —

---

## 1. Codebase and Script Inventory

### Execution scripts

| Component | Status | Notes |
|---|---|---|
| `python-utils/workflow.py` |  Rewritten | Orchestrates download, build, run, history, deploy. Supports `--datasets` (multi-dataset), two-pass Gradle build for incompatible classpaths (`corese.local` + `corese.4.x.x`), `--scales`, `--queries`. |
| `Makefile` |  New | Shorthand targets: `regression`, `compare`, `next`, `bowlogna`, `lubm`, `bsbm`, `all`, `site`, `clean-out`. |
| `src/main/java/.../Main.java` |  Rewritten | CLI entry point. Accepts engine list, dataset name, queries file. OOM catch per engine. |
| `src/main/java/.../BenchmarkHarness.java` |  Rewritten | Warmup + 3 repetitions + median. Query timeout (30 s) via `ExecutorService`. OOM detection per file with `System.gc()` + skip. |
| `src/main/java/.../BenchmarkReport.java` |  New | Produces `benchmark-report.json` + CSV. Embeds `metadata.queries` when a queries file is provided. |
| Old shell scripts / Python notebooks |  Replaced | Superseded by `workflow.py` + Java harness. |

### Drivers

| Driver | Engine | Status |
|---|---|---|
| `CoreseDriver.java` | `corese.4.x.x` |  Stable — uses `Graph` API |
| `CoreseNextDriver.java` | `corese.next` / `corese.local` |  New — uses `Repositories`/`RepositoryConnection` API (Corese 5). Fast path via `connection.load(Path, NTRIPLES)`, line-by-line fallback for invalid IRIs. |
| `JenaDriver.java` | `jena.6.2.0` |  New — Jena 5/6 API, `Model.read()` + SPARQL `QueryExecution` |
| `RDF4JDriver.java` | `rdf4j.5.3.2` |  New — full repository reinit between repetitions to avoid negative memory delta |
| `DriverFactory.java` | — |  New — routes engine name to driver via reflection |

### Datasets

| Dataset | Script | Scales | SPARQL queries |
|---|---|---|---|
| DBpedia 3.5.1 | `datasets/dbpedia.py` | Fixed (5 files) | No |
| Bowlogna (HOBBIT) | `datasets/bowlogna.py` | small / medium / large | Yes (embedded in JSON) |
| BSBM | `datasets/bsbm.py` | small / medium / large | No |
| LUBM | `datasets/lubm.py` | small / medium / large | No |

---

## 2. Metrics and Measurement Evaluation

### Metrics retained

| Metric | Source | Notes |
|---|---|---|
| `loadingTimeMs` | `System.currentTimeMillis()` before/after `load()` | Median of 3 repetitions |
| `throughputTriplesPerSec` | triples / loadingTimeMs × 1000 | Derived |
| `memoryDeltaMb` | `MemoryMXBean` — forced GC before + after | Delta heap used |
| `cpuPercent` | `OperatingSystemMXBean.getProcessCpuLoad()` | Averaged during loading |
| `repetitionsMs` | Raw values of 3 repetitions | Reported for transparency |

### Measurement protocol

1. **Warmup** — load → clear → GC (discarded)
2. **3 repetitions** — forced GC + memory snapshot before, load, forced GC + memory snapshot after
3. **Keep median** of the 3 repetitions

This eliminates JIT compilation bias and GC timing noise.

### Known gaps and mitigations

| Gap | Mitigation |
|---|---|
| DBpedia `homepages_en.nt` contains ~300 invalid IPv4 IRIs | CoreseNextDriver falls back to line-by-line skip; RDF4J logs WARN and skips; Jena skips silently |
| Negative `memoryDeltaMb` on RDF4J repetitions 2-3 | Full repository reinit between repetitions (not just `conn.clear()`) |
| Query timeout risk on large datasets | 30 s timeout per query via `Future.get(30, SECONDS)`; result logged as `TIMEOUT` |
| OOM risk on very large files | `OutOfMemoryError` caught per file + `System.gc()` + file skipped with WARN log |
| Corese 5 classpath incompatible with Corese 4.x.x | Two-pass Gradle build in `workflow.py` + JSON merge |

---

## 3. Baseline Reproducibility

Validated on local environments (Windows 11, Java 21, Conda `benchmarkenv`):

- `make regression` — corese.local vs corese.4.6.5 on DBpedia 
- `make compare` — corese + jena + rdf4j on DBpedia 
- `make bowlogna SCALES=small` — Bowlogna with SPARQL queries 
- `make all DATASETS=dbpedia,bowlogna` — multi-dataset merge 

---

## 4. Reusable Components

- **`BenchmarkHarness`** — generic, engine-agnostic; add a new engine by implementing `TripleStoreDriver`
- **`DriverFactory`** — reflection-based instantiation from engine name string
- **`workflow.py`** — extensible: new dataset = add a module in `datasets/` with a `prepare()` function
- **Dashboard** (`site/`) — data-driven: any `benchmark-report.json` structure is visualized automatically

---
