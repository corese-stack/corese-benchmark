#!/usr/bin/env python3
"""
Orchestrateur automatique de file d'attente GitHub Actions pour la campagne week-end.
Ce script tourne sur la machine hôte ou peut être déclenché séquentiellement.
"""
import subprocess
import time
import json
import sys

WORKLOADS = [
    # Batch 1: Corese Next
    {"engines": "corese.next", "datasets": "dbpedia,bowlogna,lubm,bsbm,named-graphs", "scales": "small,medium"},
    # Batch 2: Jena 6.2.0 (in-memory & tdb2)
    {"engines": "jena.6.2.0,jena.6.2.0.tdb2", "datasets": "dbpedia,bowlogna,lubm,bsbm,named-graphs", "scales": "small,medium"},
    # Batch 3: Corese 4.6.5
    {"engines": "corese.4.6.5", "datasets": "dbpedia,bowlogna,lubm,bsbm,named-graphs", "scales": "small,medium"},
    # Batch 4: RDF4J 6.1.0 (in-memory, native, lmdb)
    {"engines": "rdf4j.6.1.0,rdf4j.6.1.0.native,rdf4j.6.1.0.lmdb", "datasets": "dbpedia,bowlogna,lubm,bsbm,named-graphs", "scales": "small,medium"},
]

def log(msg):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def is_run_active():
    res = subprocess.run(["gh", "run", "list", "--repo", "corese-stack/corese-benchmark", "--workflow=ci.yml", "-L", "5", "--json", "databaseId,status,conclusion"], capture_output=True, text=True)
    if res.returncode != 0:
        return False
    try:
        runs = json.loads(res.stdout)
        for r in runs:
            if r.get("status") in ["in_progress", "queued", "pending"]:
                return True
    except:
        pass
    return False

def trigger(batch):
    cmd = [
        "gh", "workflow", "run", "ci.yml",
        "--repo", "corese-stack/corese-benchmark",
        "--ref", "feature/30-dashboard-v3",
        "-f", f"engines={batch['engines']}",
        "-f", f"datasets={batch['datasets']}",
        "-f", f"scales={batch['scales']}",
        "-f", "force_all_engines=true"
    ]
    log(f"Triggering: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)

def main():
    log("Starting weekend campaign queue monitor...")
    for idx, batch in enumerate(WORKLOADS):
        log(f"--- Preparing Batch {idx+1}/{len(WORKLOADS)}: {batch['engines']} ---")
        while is_run_active():
            log("A workflow run is currently in progress. Waiting 60s...")
            time.sleep(60)
        
        trigger(batch)
        log(f"Batch {idx+1} triggered. Waiting 30s for GitHub to register...")
        time.sleep(30)
        
    log("All 4 batches have been queued successfully!")

if __name__ == "__main__":
    main()
