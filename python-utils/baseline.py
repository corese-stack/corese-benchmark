"""baseline.py — Module for managing immutable reference baseline benchmarks and report merging.

This module provides:
1. Frozen baseline management for immutable releases (Corese 4.6.5, Apache Jena 6.2.0, Eclipse RDF4J 5.3.2).
2. Intelligent engine execution planning: skips immutable engines already present in baseline.
3. Safe, deterministic merging of fresh runs with baseline runs into unified JSON, JS, and CSV outputs.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone

IMMUTABLE_ENGINES = ("corese.4.6.5", "jena.6.2.0", "rdf4j.5.3.2")

# SPARQL category patterns matching SparqlAnalyser.java
_P_IRI = re.compile(r"<[^>]*>")
_P_COMMENT = re.compile(r"#[^\n]*")
_P_STRING = re.compile(r'"[^"]*"|\'[^\']*\'')
_P_SUBQUERY = re.compile(r"\{[^{}]*\bSELECT\b", re.IGNORECASE)
_P_GROUP_BY = re.compile(r"\bGROUP\s+BY\b", re.IGNORECASE)
_P_TEMPORAL = re.compile(
    r"\bNOW\s*\(|\bXSD:DATETIME\b|\bXSD:DATE\b|\b(?:DAY|MONTH|YEAR|HOURS|MINUTES|SECONDS)\s*\(",
    re.IGNORECASE,
)


def classify_sparql(sparql: str | None) -> str:
    """Classify SPARQL query matching Java SparqlAnalyser.java."""
    if not sparql or not sparql.strip():
        return "GRAPH_PATTERN"
    cleaned = _P_IRI.sub("<>", sparql)
    cleaned = _P_COMMENT.sub("", cleaned)
    cleaned = _P_STRING.sub('""', cleaned)
    if _P_SUBQUERY.search(cleaned):
        return "SUBQUERY"
    if _P_GROUP_BY.search(cleaned):
        return "GROUP_BY"
    if _P_TEMPORAL.search(cleaned):
        return "TEMPORAL"
    return "GRAPH_PATTERN"


def natural_query_key(query_id: str) -> tuple[int, str]:
    """Sort query_1, query_2, ..., query_10 naturally."""
    match = re.search(r"\d+", query_id)
    if match:
        return (int(match.group()), query_id)
    return (sys.maxsize, query_id)


@dataclass(frozen=True)
class ExecutionPlan:
    cached_engines: list[str]
    fresh_engines: list[str]

    @property
    def has_fresh(self) -> bool:
        return len(self.fresh_engines) > 0


def load_baseline(path: str) -> dict:
    """Load baseline dictionary from path if present, otherwise return empty structure."""
    if not os.path.exists(path):
        return {"metadata": {}, "runs": [], "queryRuns": []}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return {"metadata": {}, "runs": [], "queryRuns": []}
            data.setdefault("metadata", {})
            data.setdefault("runs", [])
            data.setdefault("queryRuns", [])
            return data
    except (json.JSONDecodeError, OSError) as err:
        print(f"[baseline] Warning: failed to parse baseline at {path}: {err}", file=sys.stderr)
        return {"metadata": {}, "runs": [], "queryRuns": []}


def plan_engines(
    requested_engines: list[str],
    requested_datasets: list[str],
    baseline: dict,
    *,
    force_all: bool = False,
    update_baseline: bool = False,
) -> ExecutionPlan:
    """Determine which engines can be read from the baseline and which need fresh execution.

    An engine is eligible for baseline cache if:
    1. It is declared in IMMUTABLE_ENGINES.
    2. Neither force_all nor update_baseline is set.
    3. The baseline contains valid loading run records for all requested datasets.
    """
    if force_all or update_baseline:
        return ExecutionPlan(cached_engines=[], fresh_engines=list(requested_engines))

    baseline_runs = baseline.get("runs", [])
    have_coverage = {(r["engine"], r["dataset"]) for r in baseline_runs if "engine" in r and "dataset" in r}

    cached: list[str] = []
    fresh: list[str] = []

    for eng in requested_engines:
        if eng in IMMUTABLE_ENGINES and all((eng, ds) in have_coverage for ds in requested_datasets):
            cached.append(eng)
        else:
            fresh.append(eng)

    return ExecutionPlan(cached_engines=cached, fresh_engines=fresh)


def merge_reports(
    baseline_data: dict,
    fresh_data: dict,
    cached_engines: list[str] | set[str] | None = None,
) -> dict:
    """Merge baseline data and fresh data into a deterministic, unified report dictionary."""
    cached_set = set(cached_engines) if cached_engines is not None else set(IMMUTABLE_ENGINES)

    # 1. Merge runs: key = (dataset, engine, file)
    merged_runs_map: dict[tuple[str, str, str], dict] = {}
    for r in baseline_data.get("runs", []):
        eng = r.get("engine")
        ds = r.get("dataset")
        f = r.get("file", "")
        if eng in cached_set and ds:
            merged_runs_map[(ds, eng, f)] = dict(r)

    for r in fresh_data.get("runs", []):
        eng = r.get("engine")
        ds = r.get("dataset")
        f = r.get("file", "")
        if eng and ds:
            # Fresh execution overwrites baseline
            merged_runs_map[(ds, eng, f)] = dict(r)

    # 2. Merge queryRuns: key = (dataset, engine, queryId)
    merged_qruns_map: dict[tuple[str, str, str], dict] = {}
    for q in baseline_data.get("queryRuns", []):
        eng = q.get("engine")
        ds = q.get("dataset")
        qid = q.get("queryId")
        if eng in cached_set and ds and qid:
            merged_qruns_map[(ds, eng, qid)] = dict(q)

    for q in fresh_data.get("queryRuns", []):
        eng = q.get("engine")
        ds = q.get("dataset")
        qid = q.get("queryId")
        if eng and ds and qid:
            merged_qruns_map[(ds, eng, qid)] = dict(q)

    # Sort deterministically
    sorted_runs = [
        merged_runs_map[k]
        for k in sorted(merged_runs_map.keys())
    ]
    sorted_qruns = [
        merged_qruns_map[k]
        for k in sorted(
            merged_qruns_map.keys(),
            key=lambda k: (k[0], k[1], natural_query_key(k[2])),
        )
    ]

    # Merge metadata
    meta = dict(baseline_data.get("metadata", {}))
    fresh_meta = fresh_data.get("metadata", {})
    meta.update(fresh_meta)

    # Preserve datasetQueries mapping across both sources
    ds_queries = dict(baseline_data.get("metadata", {}).get("datasetQueries", {}))
    ds_queries.update(fresh_meta.get("datasetQueries", {}))
    if ds_queries:
        meta["datasetQueries"] = ds_queries

    # Populate queries list for app.js backwards-compatibility if missing
    if "queries" not in meta or not meta["queries"]:
        for queries_list in ds_queries.values():
            if queries_list:
                meta["queries"] = queries_list
                break

    meta["baselineEngines"] = sorted(cached_set)
    if "generatedAt" not in fresh_meta:
        meta["generatedAt"] = datetime.now(timezone.utc).isoformat()  # noqa: UP017 (Python 3.9 compatibility)

    return {
        "metadata": meta,
        "runs": sorted_runs,
        "queryRuns": sorted_qruns,
    }


def save_baseline(baseline_data: dict, destination_path: str) -> None:
    """Save baseline dictionary to destination atomically with strict validation."""
    runs = baseline_data.get("runs", [])
    if not runs:
        raise ValueError("Refusing to save empty baseline")

    # Strictly check that ONLY immutable engines are saved into baseline
    for r in runs:
        eng = r.get("engine", "")
        if eng not in IMMUTABLE_ENGINES:
            raise ValueError(f"Refusing to save non-immutable engine into baseline: {eng}")

    dest_dir = os.path.dirname(destination_path)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", dir=dest_dir or ".", delete=False, encoding="utf-8") as f:
        tmp_path = f.name
        json.dump(baseline_data, f, indent=2)

    try:
        # Validation: re-read to ensure valid JSON
        with open(tmp_path, encoding="utf-8") as f:
            validated = json.load(f)
            if not isinstance(validated, dict) or "runs" not in validated:
                raise ValueError("Baseline validation failed on temp file")

        os.replace(tmp_path, destination_path)
        print(f"[baseline] Successfully wrote and validated baseline: {destination_path}")
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def _fmt_float(val: float | None) -> str:
    """Safely format float value to 2 decimals, returning empty string for None."""
    if val is None:
        return ""
    try:
        return f"{float(val):.2f}"
    except (ValueError, TypeError):
        return ""


def export_site_data(merged_data: dict, site_data_dir: str) -> None:
    """Generate benchmark-report.json, report-data.js, and benchmark-report.csv from a single merged dict."""
    os.makedirs(site_data_dir, exist_ok=True)

    json_path = os.path.join(site_data_dir, "benchmark-report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2)
    print(f"[site] Wrote {json_path}")

    js_path = os.path.join(site_data_dir, "report-data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(f"window.__BENCHMARK_DATA__ = {json.dumps(merged_data, indent=2)};\n")
    print(f"[site] Wrote {js_path}")

    csv_path = os.path.join(site_data_dir, "benchmark-report.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # 1. Loading runs table
        writer.writerow([
            "engine", "dataset", "file", "triples", "loadingTimeMs",
            "throughputTriplesPerSec", "memoryBeforeMb", "memoryAfterMb",
            "memoryDeltaMb", "cpuPercent"
        ])
        for r in merged_data.get("runs", []):
            writer.writerow([
                r.get("engine", ""),
                r.get("dataset", ""),
                r.get("file", ""),
                r.get("triples", 0),
                r.get("loadingTimeMs", 0),
                _fmt_float(r.get("throughputTriplesPerSec")),
                _fmt_float(r.get("memoryBeforeMb")),
                _fmt_float(r.get("memoryAfterMb")),
                _fmt_float(r.get("memoryDeltaMb")),
                _fmt_float(r.get("cpuPercent")),
            ])
        writer.writerow([])
        # 2. Query runs table
        writer.writerow([
            "engine", "dataset", "queryId", "queryCategory", "medianMs",
            "medianTtfrMs", "heapDeltaMb", "rowCount", "resultHash", "status"
        ])
        for q in merged_data.get("queryRuns", []):
            writer.writerow([
                q.get("engine", ""),
                q.get("dataset", ""),
                q.get("queryId", ""),
                q.get("queryCategory", ""),
                q.get("medianMs", -1),
                q.get("medianTtfrMs", -1),
                _fmt_float(q.get("heapDeltaMb")),
                q.get("rowCount", -1),
                q.get("resultHash", ""),
                q.get("status", "PASS" if q.get("medianMs", -1) >= 0 else "TIMEOUT"),
            ])
    print(f"[site] Wrote unified CSV {csv_path}")
