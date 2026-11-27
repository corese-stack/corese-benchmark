#!/usr/bin/env python3
"""Synchronize GitHub Actions benchmark artifacts and merge local reports into site/data/."""
from __future__ import annotations

import subprocess
import json
import glob
import os
import argparse
import re
from datetime import datetime, timezone

from baseline import (
    IMMUTABLE_ENGINES,
    loading_runs,
    prune_report_for_site,
    TERMINAL_LOADING_FAILURES,
    export_site_data,
    has_canonical_loading_coverage,
    has_v1_query_coverage,
    load_expected_v1_queries,
    save_baseline,
    valid_loading_run,
)

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DATA_DIR = os.path.join(PROJECT_DIR, "site", "data")
OUT_JSON_DIR = os.path.join(PROJECT_DIR, "out", "json")
TMP_RUNS_DIR = os.path.join(PROJECT_DIR, "build", "day_runs")
NIGHT_RUNS_DIR = os.path.join(PROJECT_DIR, "build", "night_runs")
JSON_GLOB = "*.json"

# Seuil temporel de coupure pour la nouvelle campagne propre du week-end
CAMPAIGN_CUTOFF_DATE = "2026-11-20T17:00:00Z"

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def _download_run_artifact(run):
    """Download a successful campaign run's artifact unless its directory exists."""
    created = run.get("createdAt") or run.get("updatedAt") or ""
    if created < CAMPAIGN_CUTOFF_DATE:
        return None
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        return None
    rid = str(run["databaseId"])
    target_dir = os.path.join(TMP_RUNS_DIR, f"run-{rid}")
    if os.path.exists(target_dir):
        return None
    print(f"[sync] Downloading completed run {rid}...")
    os.makedirs(target_dir, exist_ok=True)
    dl = run_cmd(f"gh run download {rid} --repo corese-stack/corese-benchmark -n benchmark-data -D {target_dir}")
    if dl.returncode == 0:
        return target_dir
    print(f"[sync] Artifact not available for {rid}")
    return None

def fetch_latest_artifacts():
    os.makedirs(TMP_RUNS_DIR, exist_ok=True)
    res = run_cmd("gh run list --repo corese-stack/corese-benchmark --workflow=ci.yml --limit 20 --json databaseId,status,conclusion,updatedAt,createdAt,headBranch")
    if res.returncode != 0:
        print("[sync] Error listing runs:", res.stderr)
        return []
    runs = json.loads(res.stdout)
    downloaded = []
    for run in runs:
        target_dir = _download_run_artifact(run)
        if target_dir is not None:
            downloaded.append(target_dir)
    return downloaded

def _ingest_file(f, merged_loading, merged_queries, expected_queries=None):
    """Ingest a single report JSON into merged maps."""
    if expected_queries is None:
        expected_queries = load_expected_v1_queries()
    try:
        with open(f, encoding="utf-8") as fp:
            d = json.load(fp)
            lruns = d.get("loadingRuns", []) or d.get("runs", [])
            for r in lruns:
                k = (r.get("engine"), r.get("dataset"), r.get("format"), r.get("scale"), r.get("file"))
                merged_loading[k] = r
            for q in d.get("queryRuns", []):
                qid = q.get("queryId", "")
                if re.fullmatch(r"Q\d+", qid) and qid in expected_queries.get(q.get("dataset"), set()):
                    k = (q.get("engine"), q.get("dataset"), qid)
                    merged_queries[k] = q
            return d.get("metadata")
    except (OSError, json.JSONDecodeError):
        return None

def report_sort_key(path):
    """Order reports by their embedded timestamp, with a stable filename fallback."""
    generated = ""
    try:
        with open(path, encoding="utf-8") as stream:
            metadata = json.load(stream).get("metadata", {})
        stamp = metadata.get("generatedAt", "")
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        generated = parsed.astimezone(timezone.utc).isoformat()
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return generated, os.path.basename(path), path

def promote_baseline(report, expected_queries, destination):
    """Freeze only complete immutable engines with valid v1 queries and complete dataset loading runs."""
    eligible = set()
    for engine in IMMUTABLE_ENGINES:
        loading = [r for r in loading_runs(report) if r.get("engine") == engine]
        if not loading or not all(
            valid_loading_run(r) or r.get("status") in TERMINAL_LOADING_FAILURES for r in loading
        ):
            continue
        if all(
            has_canonical_loading_coverage(loading, engine, ds)
            and has_v1_query_coverage(
                report, engine, ds, expected_queries, require_pass=True,
            )
            for ds in expected_queries
        ):
            eligible.add(engine)
    loading = [r for r in loading_runs(report) if r.get("engine") in eligible]
    frozen = {
        "metadata": dict(report.get("metadata", {})),
        "loadingRuns": list(loading),
        "queryRuns": [q for q in report["queryRuns"] if q.get("engine") in eligible],
    }
    save_baseline(frozen, destination)

def merge_all_data(*, promote=False):
    files = glob.glob(os.path.join(OUT_JSON_DIR, JSON_GLOB))
    files.extend(glob.glob(os.path.join(TMP_RUNS_DIR, "*", "out", "json", JSON_GLOB)))
    files.extend(glob.glob(os.path.join(NIGHT_RUNS_DIR, "*", "out", "json", JSON_GLOB)))

    files.sort(key=report_sort_key)
    expected_queries = load_expected_v1_queries()

    merged_loading = {}
    merged_queries = {}
    latest_meta = None
    
    for f in files:
        meta = _ingest_file(f, merged_loading, merged_queries, expected_queries)
        if meta:
            latest_meta = meta
            
    print(f"[merge] Total loading observations: {len(merged_loading)}")
    print(f"[merge] Total query observations: {len(merged_queries)}")
    
    report = {
        "metadata": latest_meta or {},
        "runs": [merged_loading[k] for k in sorted(merged_loading, key=lambda k: tuple(str(v or "") for v in k))],
        "queryRuns": [merged_queries[k] for k in sorted(merged_queries)]
    }
    
    report = prune_report_for_site(report, expected_queries=expected_queries, require_complete_queries=True)
    export_site_data(report, SITE_DATA_DIR)
    if promote:
        promote_baseline(
            report,
            expected_queries,
            os.path.join(SITE_DATA_DIR, "baseline.json"),
        )
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-fetch", action="store_true", help="Merge local reports without downloading artifacts.")
    parser.add_argument("--promote-baseline", action="store_true", help="Save complete validated immutable engines as the baseline.")
    args = parser.parse_args()
    if not args.skip_fetch:
        fetch_latest_artifacts()
    merge_all_data(promote=args.promote_baseline)
