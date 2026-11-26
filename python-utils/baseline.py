"""baseline.py — Module for managing immutable reference baseline benchmarks and report merging.

This module provides:
1. Frozen baseline management for immutable releases (Corese 4.6.5/4.6.4, Apache Jena 6.2.0 including TDB2, Eclipse RDF4J 6.1.0 including Native/LMDB).
2. Intelligent engine execution planning: skips immutable engines already present in baseline.
3. Safe, deterministic merging of fresh runs with baseline runs into unified JSON, JS, and CSV outputs.
"""

from __future__ import annotations

import csv
import json
import math
import os
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

IMMUTABLE_ENGINES = (
    "corese.4.6.5", "corese.4.6.4", "jena.6.2.0", "jena.6.2.0.tdb2",
    "rdf4j.6.1.0", "rdf4j.6.1.0.native", "rdf4j.6.1.0.lmdb",
)
DEFAULT_CATALOGUE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "site", "data", "sparql", "v1", "catalogue.json",
)
SCALED_DATASETS = frozenset({"lubm", "bsbm"})
TERMINAL_LOADING_FAILURES = frozenset({"OOM", "TIMEOUT", "ERROR"})


def load_expected_v1_queries(catalogue_path: str = DEFAULT_CATALOGUE_PATH) -> dict[str, set[str]]:
    """Read curated v1 query IDs grouped by dataset; fail on an invalid catalogue."""
    with open(catalogue_path, encoding="utf-8") as stream:
        catalogue = json.load(stream)
    expected: dict[str, set[str]] = {}
    for query in catalogue["queries"]:
        if re.fullmatch(r"Q\d+", query["id"]):
            expected.setdefault(query["dataset"], set()).add(query["id"])
    if not expected:
        raise ValueError("Catalogue contains no SPARQL v1 queries")
    return expected


def has_v1_query_coverage(
    report: dict, engine: str, dataset: str, expected_queries: dict[str, set[str]],
    *, require_pass: bool = False,
) -> bool:
    """Check exact catalogue IDs for one engine and dataset, excluding legacy rows."""
    expected = expected_queries.get(dataset, set())
    present = {
        query.get("queryId") for query in report.get("queryRuns", [])
        if query.get("engine") == engine and query.get("dataset") == dataset
        and re.fullmatch(r"Q\d+", query.get("queryId", ""))
        and (not require_pass or query.get("status") == "PASS")
    }
    return expected <= present


def valid_loading_run(run: dict) -> bool:
    """Accept successful loading observations with finite, nonnegative measurements."""
    elapsed = run.get("loadingTimeMs")
    triples = run.get("triples")
    return (
        run.get("status") in (None, "SUCCESS") and not run.get("errorMessage")
        and isinstance(elapsed, (int, float)) and math.isfinite(elapsed) and elapsed >= 0
        and isinstance(triples, (int, float)) and math.isfinite(triples) and triples > 0
    )


def has_scale_loading_coverage(
    runs: list[dict],
    engine: str,
    dataset: str,
    requested_scales: list[str] | tuple[str, ...] | None = None,
) -> bool:
    """Verify valid loading runs for one engine/dataset, enforcing per-scale coverage on scaled datasets."""
    matching = [r for r in runs if r.get("engine") == engine and r.get("dataset") == dataset]
    if not any(valid_loading_run(r) for r in matching):
        return False
    if dataset in SCALED_DATASETS and requested_scales:
        for scale in requested_scales:
            scale_norm = scale.strip().lower()
            if not scale_norm:
                continue
            token = f"_{scale_norm}."
            if not any(
                (str(r.get("scale", "")).lower() == scale_norm or token in str(r.get("file", "")).lower())
                and (valid_loading_run(r) or r.get("status") in TERMINAL_LOADING_FAILURES)
                for r in matching
            ):
                return False
    return True

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
    expected_queries: dict[str, set[str]] | None = None,
    requested_scales: list[str] | tuple[str, ...] | None = None,
    force_all: bool = False,
    update_baseline: bool = False,
) -> ExecutionPlan:
    """Determine which engines can be read from the baseline and which need fresh execution.

    An engine is eligible for baseline cache if:
    1. It is declared in IMMUTABLE_ENGINES.
    2. Neither force_all nor update_baseline is set.
    3. The baseline contains valid loading run records covering requested scales for all datasets.
    4. Catalogue datasets contain every expected v1 query ID. Legacy datasets retain loading-only checks.
    """
    if force_all or update_baseline:
        return ExecutionPlan(cached_engines=[], fresh_engines=list(requested_engines))

    if expected_queries is None:
        expected_queries = load_expected_v1_queries()
    baseline_runs = baseline.get("runs") or baseline.get("loadingRuns") or []

    cached: list[str] = []
    fresh: list[str] = []

    for eng in requested_engines:
        if eng in IMMUTABLE_ENGINES and all(
            has_scale_loading_coverage(baseline_runs, eng, ds, requested_scales)
            and has_v1_query_coverage(baseline, eng, ds, expected_queries)
            for ds in requested_datasets
        ):
            cached.append(eng)
        else:
            fresh.append(eng)

    return ExecutionPlan(cached_engines=cached, fresh_engines=fresh)


def _merge_runs(
    baseline_data: dict,
    fresh_data: dict,
    cached_set: set[str],
) -> list[dict]:
    """Merge and deterministically sort benchmark runs from baseline and fresh reports."""
    merged_runs_map: dict[tuple[str, str, str], dict] = {}
    baseline_runs = baseline_data.get("runs") or baseline_data.get("loadingRuns") or []
    for r in baseline_runs:
        eng = r.get("engine")
        ds = r.get("dataset")
        f = r.get("file", "")
        if eng in cached_set and ds:
            merged_runs_map[(ds, eng, f)] = dict(r)

    fresh_runs = fresh_data.get("runs") or fresh_data.get("loadingRuns") or []
    for r in fresh_runs:
        eng = r.get("engine")
        ds = r.get("dataset")
        f = r.get("file", "")
        if eng and ds:
            merged_runs_map[(ds, eng, f)] = dict(r)

    return [merged_runs_map[k] for k in sorted(merged_runs_map.keys())]


def _merge_query_runs(
    baseline_data: dict,
    fresh_data: dict,
    cached_set: set[str],
) -> list[dict]:
    """Merge and deterministically sort query runs from baseline and fresh reports."""
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

    return [
        merged_qruns_map[k]
        for k in sorted(
            merged_qruns_map.keys(),
            key=lambda k: (k[0], k[1], natural_query_key(k[2])),
        )
    ]


def _merge_metadata(
    baseline_data: dict,
    fresh_data: dict,
    cached_set: set[str],
) -> dict:
    """Merge metadata dictionaries, preserving queries and dataset mappings."""
    meta = dict(baseline_data.get("metadata", {}))
    fresh_meta = fresh_data.get("metadata", {})
    meta.update(fresh_meta)

    ds_queries = dict(baseline_data.get("metadata", {}).get("datasetQueries", {}))
    ds_queries.update(fresh_meta.get("datasetQueries", {}))
    if ds_queries:
        meta["datasetQueries"] = ds_queries

    if "queries" not in meta or not meta["queries"]:
        for queries_list in ds_queries.values():
            if queries_list:
                meta["queries"] = queries_list
                break

    meta["baselineEngines"] = sorted(cached_set)
    if "generatedAt" not in fresh_meta:
        meta["generatedAt"] = datetime.now(timezone.utc).isoformat()

    return meta


def merge_reports(
    baseline_data: dict,
    fresh_data: dict,
    cached_engines: list[str] | set[str] | None = None,
) -> dict:
    """Merge baseline data and fresh data into a deterministic, unified report dictionary."""
    cached_set = set(cached_engines) if cached_engines is not None else set(IMMUTABLE_ENGINES)
    merged_runs = _merge_runs(baseline_data, fresh_data, cached_set)

    return {
        "metadata": _merge_metadata(baseline_data, fresh_data, cached_set),
        "runs": merged_runs,
        "loadingRuns": list(merged_runs),
        "queryRuns": _merge_query_runs(baseline_data, fresh_data, cached_set),
    }


def save_baseline(baseline_data: dict, destination_path: str) -> None:
    """Save baseline dictionary to destination atomically with strict validation."""
    runs = baseline_data.get("runs", [])
    if not runs:
        raise ValueError("Refusing to save empty baseline")

    # Strictly check that ONLY immutable engines are saved into baseline
    for r in runs + baseline_data.get("loadingRuns", []) + baseline_data.get("queryRuns", []):
        eng = r.get("engine", "")
        if eng not in IMMUTABLE_ENGINES:
            raise ValueError(f"Refusing to save non-immutable engine into baseline: {eng}")

    dest_dir = os.path.dirname(destination_path)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)

    tmp_path = os.path.join(dest_dir or ".", f".baseline.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    with open(tmp_path, "x", encoding="utf-8") as f:
        json.dump(baseline_data, f, separators=(",", ":"))

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
    loading_runs = list(merged_data.get("runs") or merged_data.get("loadingRuns") or [])
    merged_data = {**merged_data, "runs": loading_runs, "loadingRuns": list(loading_runs),
                   "queryRuns": list(merged_data.get("queryRuns") or [])}
    os.makedirs(site_data_dir, exist_ok=True)

    json_path = os.path.join(site_data_dir, "benchmark-report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2)
    print(f"[site] Wrote {json_path}")

    js_path = os.path.join(site_data_dir, "report-data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(f"window.BENCHMARK_REPORT = {json.dumps(merged_data, indent=2)};\n")
    print(f"[site] Wrote {js_path}")

    csv_path = os.path.join(site_data_dir, "benchmark-report.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # 1. Loading runs table
        writer.writerow([
            "engine", "dataset", "file", "triples", "loadingTimeMs",
            "throughputTriplesPerSec", "memoryBeforeMb", "memoryAfterMb",
            "memoryDeltaMb", "cpuPercent", "status", "errorMessage"
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
                r.get("status") or "SUCCESS",
                r.get("errorMessage", ""),
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
