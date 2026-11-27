"""Manage the frozen immutable reference baseline, engine planning, and report exports."""

from __future__ import annotations

import csv
import json
import math
import os
import re
import sys
import uuid
from statistics import median
from dataclasses import dataclass
from datetime import datetime, timezone

IMMUTABLE_ENGINES = (
    "corese.4.6.5", "corese.4.6.4", "jena.6.2.0", "jena.6.2.0.tdb2",
    "jena.6.1.0", "jena.6.1.0.tdb2",
    "rdf4j.6.1.0", "rdf4j.6.1.0.native", "rdf4j.6.1.0.lmdb",
    "rdf4j.5.3.2", "rdf4j.5.3.2.native", "rdf4j.5.3.2.lmdb",
)
MULTI_FORMAT_EXTENSIONS = ("nt", "nq", "ttl", "trig", "rdf", "jsonld")
MULTI_FORMAT_CANONICAL_STEMS = {
    "bowlogna": "Department0", "dbpedia": "persondata_en", "lubm": "lubm_medium",
}
CANONICAL_NAMED_GRAPHS_FILE = "corese-feature-lubm.nq"
LEGACY_NAMED_GRAPHS_FILE = "named-graphs.nq"
CANONICAL_SPARQL_FILES = {
    "bowlogna": "Department0.nt", "bsbm": "bsbm_small.nt",
    "dbpedia": "persondata_en.nt", "lubm": "lubm_small.nt",
    "named-graphs": CANONICAL_NAMED_GRAPHS_FILE,
}

def loading_runs(report: dict) -> list[dict]:
    """Read the canonical field, accepting legacy reports."""
    return report.get("loadingRuns", report.get("runs", []))

def _report_metadata(report: dict) -> dict:
    """Copy report metadata without obsolete embedded query catalogues."""
    return {key: value for key, value in report.get("metadata", {}).items()
            if key not in ("queries", "datasetQueries")}

def is_canonical_dashboard_loading_run(run: dict) -> bool:
    dataset, filename = run.get("dataset"), run.get("file", "")
    if dataset == "named-graphs":
        return filename in (CANONICAL_NAMED_GRAPHS_FILE, LEGACY_NAMED_GRAPHS_FILE)
    if dataset == "bsbm":
        return filename == "bsbm_medium.nt"
    stem = {"bowlogna": "Department0",
            "lubm": "lubm_medium", "dbpedia": "persondata_en"}.get(dataset)
    return bool(stem and filename.startswith(stem + "."))

def extract_dataset_sizes(loading_runs: list[dict]) -> dict[str, int]:
    sizes = {}
    for dataset, target in CANONICAL_SPARQL_FILES.items():
        files = {target, LEGACY_NAMED_GRAPHS_FILE} if dataset == "named-graphs" else {target}
        counts = [r["triples"] for r in loading_runs
                  if r.get("dataset") == dataset and r.get("file") in files
                  and isinstance(r.get("triples"), (int, float))
                  and not isinstance(r["triples"], bool)
                  and math.isfinite(r["triples"]) and r["triples"] > 0]
        if counts:
            sizes[f"{dataset}:{target}"] = int(round(median(counts)))
    return sizes

def _complete_query_engines(report: dict, raw: list[dict], queries: list[dict], expected_queries) -> set[str]:
    expected = load_expected_v1_queries() if expected_queries is None else expected_queries
    engines = {r.get("engine") for r in raw + queries}
    return {
        engine for engine in engines
        if all(has_v1_query_coverage(report, engine, ds, expected) for ds in expected)
    }

def _normalize_pruned_loading_run(run: dict, canonical_named: set[str], eligible: set[str] | None) -> dict | None:
    if not is_canonical_dashboard_loading_run(run):
        return None
    if eligible is not None and run.get("engine") not in eligible:
        return None
    copy_run = dict(run)
    if copy_run.get("dataset") == "named-graphs" and copy_run["file"] == LEGACY_NAMED_GRAPHS_FILE:
        if copy_run.get("engine") in canonical_named:
            return None
        copy_run["file"] = CANONICAL_NAMED_GRAPHS_FILE
    return copy_run

def prune_report_for_site(report: dict, *, expected_queries=None,
                          require_complete_queries: bool = False) -> dict:
    """Keep dashboard observations and preserve measured SPARQL input sizes."""
    raw = loading_runs(report)
    meta = _report_metadata(report)
    sizes = dict(meta.get("datasetSizes", {}))
    sizes.update(extract_dataset_sizes(raw))
    if sizes:
        meta["datasetSizes"] = sizes
    queries = report.get("queryRuns", [])
    eligible = _complete_query_engines(report, raw, queries, expected_queries) if require_complete_queries else None
    canonical_named = {
        r.get("engine") for r in raw
        if r.get("dataset") == "named-graphs" and r.get("file") == CANONICAL_NAMED_GRAPHS_FILE
    }
    pruned = {}
    for run in raw:
        normalized = _normalize_pruned_loading_run(run, canonical_named, eligible)
        if normalized is not None:
            pruned[(normalized["dataset"], normalized["engine"], normalized["file"])] = normalized
    return {"metadata": meta, "loadingRuns": [pruned[k] for k in sorted(pruned)],
            "queryRuns": [dict(q) for q in queries if eligible is None or q.get("engine") in eligible]}

DEFAULT_CATALOGUE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "input", "queries", "v1", "catalogue.json",
)
RESOURCE_LIMIT_FAILURES = frozenset({"OOM", "TIMEOUT"})
TERMINAL_LOADING_FAILURES = RESOURCE_LIMIT_FAILURES | frozenset({"ERROR"})

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

def has_canonical_loading_coverage(runs: list[dict], engine: str, dataset: str) -> bool:
    """Require a canonical loading observation and reject any dataset error."""
    matching = [r for r in runs if r.get("engine") == engine and r.get("dataset") == dataset]
    if any(r.get("status") == "ERROR" for r in matching):
        return False
    if dataset in MULTI_FORMAT_CANONICAL_STEMS:
        stem = MULTI_FORMAT_CANONICAL_STEMS[dataset]
        valid_files = {r.get("file") for r in matching if valid_loading_run(r)}
        return all(f"{stem}.{ext}" in valid_files for ext in MULTI_FORMAT_EXTENSIONS)
    if dataset == "bsbm":
        return any(r.get("file") == "bsbm_medium.nt"
                   and (valid_loading_run(r) or r.get("status") in RESOURCE_LIMIT_FAILURES)
                   for r in matching)
    if dataset == "named-graphs":
        matching = [r for r in matching if r.get("file") in
                    (CANONICAL_NAMED_GRAPHS_FILE, LEGACY_NAMED_GRAPHS_FILE)]
    return any(valid_loading_run(r) for r in matching)

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
        return {"metadata": {}, "loadingRuns": [], "queryRuns": []}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return {"metadata": {}, "loadingRuns": [], "queryRuns": []}
            data.setdefault("metadata", {})
            data.setdefault("loadingRuns", data.get("runs", []))
            data.pop("runs", None)
            data.setdefault("queryRuns", [])
            return data
    except (json.JSONDecodeError, OSError) as err:
        print(f"[baseline] Warning: failed to parse baseline at {path}: {err}", file=sys.stderr)
        return {"metadata": {}, "loadingRuns": [], "queryRuns": []}

def plan_engines(
    requested_engines: list[str],
    requested_datasets: list[str],
    baseline: dict,
    *,
    expected_queries: dict[str, set[str]] | None = None,
    force_all: bool = False,
    update_baseline: bool = False,
) -> ExecutionPlan:
    """Determine which engines can be read from the baseline and which need fresh execution.

    An engine is eligible for baseline cache if:
    1. It is declared in IMMUTABLE_ENGINES.
    2. Neither force_all nor update_baseline is set.
    3. The baseline contains valid loading run records covering canonical loading inputs for all datasets.
    4. Catalogue datasets contain every expected v1 query ID. Legacy datasets retain loading-only checks.
    """
    if force_all or update_baseline:
        return ExecutionPlan(cached_engines=[], fresh_engines=list(requested_engines))

    if expected_queries is None:
        expected_queries = load_expected_v1_queries()
    baseline_runs = loading_runs(baseline)

    cached: list[str] = []
    fresh: list[str] = []

    for eng in requested_engines:
        if eng in IMMUTABLE_ENGINES and all(
            has_canonical_loading_coverage(baseline_runs, eng, ds)
            and has_v1_query_coverage(baseline, eng, ds, expected_queries, require_pass=True)
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
    baseline_runs = loading_runs(baseline_data)
    for r in baseline_runs:
        eng = r.get("engine")
        ds = r.get("dataset")
        f = r.get("file", "")
        if eng in cached_set and ds:
            merged_runs_map[(ds, eng, f)] = dict(r)

    fresh_runs = loading_runs(fresh_data)
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
    """Merge metadata dictionaries, preserving dataset sizes."""
    meta = _report_metadata(baseline_data)
    fresh_meta = _report_metadata(fresh_data)
    meta.update(fresh_meta)

    sizes = dict(baseline_data.get("metadata", {}).get("datasetSizes", {}))
    sizes.update(fresh_meta.get("datasetSizes", {}))
    if sizes:
        meta["datasetSizes"] = sizes

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
        "loadingRuns": list(merged_runs),
        "queryRuns": _merge_query_runs(baseline_data, fresh_data, cached_set),
    }

def save_baseline(baseline_data: dict, destination_path: str) -> None:
    """Save baseline dictionary to destination atomically with strict validation."""
    runs = loading_runs(baseline_data)
    if not runs:
        raise ValueError("Refusing to save empty baseline")

    # Strictly check that ONLY immutable engines are saved into baseline
    for r in runs + baseline_data.get("queryRuns", []):
        eng = r.get("engine", "")
        if eng not in IMMUTABLE_ENGINES:
            raise ValueError(f"Refusing to save non-immutable engine into baseline: {eng}")

    dest_dir = os.path.dirname(destination_path)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)

    tmp_path = os.path.join(dest_dir or ".", f".baseline.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    with open(tmp_path, "x", encoding="utf-8") as f:
        json.dump({"metadata": _report_metadata(baseline_data), "loadingRuns": runs,
                   "queryRuns": baseline_data.get("queryRuns", [])}, f, separators=(",", ":"))

    try:
        # Validation: re-read to ensure valid JSON
        with open(tmp_path, encoding="utf-8") as f:
            validated = json.load(f)
            if not isinstance(validated, dict) or "loadingRuns" not in validated:
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
    """Generate benchmark-report.json and benchmark-report.csv from a single merged dict."""
    merged_data = {"metadata": _report_metadata(merged_data),
                   "loadingRuns": list(loading_runs(merged_data)),
                   "queryRuns": list(merged_data.get("queryRuns") or [])}
    os.makedirs(site_data_dir, exist_ok=True)

    json_path = os.path.join(site_data_dir, "benchmark-report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2)
    print(f"[site] Wrote {json_path}")

    csv_path = os.path.join(site_data_dir, "benchmark-report.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # 1. Loading runs table
        writer.writerow([
            "engine", "dataset", "file", "triples", "loadingTimeMs",
            "throughputTriplesPerSec", "memoryBeforeMb", "memoryAfterMb",
            "memoryDeltaMb", "cpuPercent", "status", "errorMessage"
        ])
        for r in merged_data["loadingRuns"]:
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
