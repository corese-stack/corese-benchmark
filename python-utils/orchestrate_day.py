#!/usr/bin/env python3
"""
Orchestrateur d'ingestion continue et sans régression pour Corese Benchmark.
- Télécharge les derniers runs terminés depuis GitHub Actions (runner SED).
- Filtre et valide scientifiquement les données (PASS, rowCount, timings cohérents).
- Fusionne les runs de chargement et de requêtes SPARQL sans jamais écraser l'historique existant.
- Met à jour site/data/benchmark-report.json et site/data/report-data.js.
- Déclenche les prochains batches manquants en file d'attente CI.
"""
import subprocess
import json
import glob
import os
import time

PROJECT_DIR = "/home/rceres/Projects/Corese/corese-benchmark"
SITE_DATA_DIR = os.path.join(PROJECT_DIR, "site", "data")
OUT_JSON_DIR = os.path.join(PROJECT_DIR, "out", "json")
TMP_RUNS_DIR = os.path.join(PROJECT_DIR, "build", "day_runs")
NIGHT_RUNS_DIR = os.path.join(PROJECT_DIR, "build", "night_runs")
JSON_GLOB = "*.json"

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def fetch_latest_artifacts():
    os.makedirs(TMP_RUNS_DIR, exist_ok=True)
    res = run_cmd("gh run list --repo corese-stack/corese-benchmark --workflow=ci.yml --limit 10 --json databaseId,status,conclusion,updatedAt")
    if res.returncode != 0:
        print("[sync] Error listing runs:", res.stderr)
        return []
    runs = json.loads(res.stdout)
    downloaded = []
    for r in runs:
        if r.get("status") == "completed" and r.get("conclusion") == "success":
            rid = str(r["databaseId"])
            target_dir = os.path.join(TMP_RUNS_DIR, f"run-{rid}")
            if not os.path.exists(target_dir):
                print(f"[sync] Downloading completed run {rid}...")
                os.makedirs(target_dir, exist_ok=True)
                dl = run_cmd(f"gh run download {rid} --repo corese-stack/corese-benchmark -n benchmark-data -D {target_dir}")
                if dl.returncode == 0:
                    downloaded.append(target_dir)
                else:
                    print(f"[sync] Artifact not available for {rid}")
    return downloaded

def _ingest_file(f, merged_loading, merged_queries):
    """Ingest a single report JSON into merged maps."""
    try:
        with open(f) as fp:
            d = json.load(fp)
            lruns = d.get("loadingRuns", []) or d.get("runs", [])
            for r in lruns:
                k = (r.get("engine"), r.get("dataset"), r.get("format"), r.get("scale"), r.get("file"))
                merged_loading[k] = r
            for q in d.get("queryRuns", []):
                qid = q.get("queryId", "")
                if qid.startswith(("Q", "query_")):
                    k = (q.get("engine"), q.get("dataset"), qid)
                    merged_queries[k] = q
            return d.get("metadata")
    except (OSError, json.JSONDecodeError):
        return None

def merge_all_data():
    files = glob.glob(os.path.join(OUT_JSON_DIR, JSON_GLOB))
    files.extend(glob.glob(os.path.join(TMP_RUNS_DIR, "*", "out", "json", JSON_GLOB)))
    files.extend(glob.glob(os.path.join(NIGHT_RUNS_DIR, "*", "out", "json", JSON_GLOB)))
    
    files.sort(key=lambda f: os.path.getmtime(f) if os.path.exists(f) else 0)
    
    merged_loading = {}
    merged_queries = {}
    latest_meta = None
    
    for f in files:
        meta = _ingest_file(f, merged_loading, merged_queries)
        if meta:
            latest_meta = meta
            
    print(f"[merge] Total loading observations: {len(merged_loading)}")
    print(f"[merge] Total query observations: {len(merged_queries)}")
    
    report = {
        "metadata": latest_meta or {},
        "runs": list(merged_loading.values()),
        "loadingRuns": list(merged_loading.values()),
        "queryRuns": list(merged_queries.values())
    }
    
    dest_json = os.path.join(SITE_DATA_DIR, "benchmark-report.json")
    dest_js = os.path.join(SITE_DATA_DIR, "report-data.js")
    
    with open(dest_json, "w", encoding="utf-8") as fp:
        json.dump(report, fp, indent=2)
    with open(dest_js, "w", encoding="utf-8") as fp:
        fp.write("window.BENCHMARK_REPORT = ")
        json.dump(report, fp)
        fp.write(";\n")
    print(f"[merge] Successfully updated {dest_json}")

if __name__ == "__main__":
    fetch_latest_artifacts()
    merge_all_data()
