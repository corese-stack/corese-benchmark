#!/usr/bin/env python3
"""
Daemon autonome pour surveiller les runs GitHub Actions, rapatrier et fusionner
les données, et déclencher les batches suivants tout au long de la journée.
"""
import subprocess
import json
import time
import os
import sys

PROJECT_DIR = "/home/rceres/Projects/Corese/corese-benchmark"
ORCHESTRATE_SCRIPT = os.path.join(PROJECT_DIR, "python-utils", "orchestrate_day.py")

DEFAULT_DATASETS = "dbpedia,bowlogna,lubm,bsbm"
DEFAULT_SCALES = "small,medium"

# Liste ordonnée des configurations manquantes à exécuter progressivement
WORKLOAD_QUEUE = [
    # 1. Jena 6.2.0 (in progress / queued)
    {"engines": "jena.6.2.0", "datasets": DEFAULT_DATASETS, "scales": DEFAULT_SCALES},
    # 2. Corese 4.6.5 (in progress / queued)
    {"engines": "corese.4.6.5", "datasets": DEFAULT_DATASETS, "scales": DEFAULT_SCALES},
    # 3. RDF4J 5.3.2 (versions antérieures stables)
    {"engines": "rdf4j.5.3.2,rdf4j.5.3.2.native,rdf4j.5.3.2.lmdb", "datasets": DEFAULT_DATASETS, "scales": DEFAULT_SCALES},
    # 4. Jena 6.1.0 & 6.1.0.tdb2
    {"engines": "jena.6.1.0,jena.6.1.0.tdb2", "datasets": DEFAULT_DATASETS, "scales": DEFAULT_SCALES},
    # 5. RDF4J 5.3.1
    {"engines": "rdf4j.5.3.1,rdf4j.5.3.1.lmdb", "datasets": DEFAULT_DATASETS, "scales": DEFAULT_SCALES}
]

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def get_runs():
    res = run_cmd("gh run list --repo corese-stack/corese-benchmark --workflow=ci.yml --limit 10 --json databaseId,status,conclusion,updatedAt")
    if res.returncode == 0:
        try:
            return json.loads(res.stdout)
        except json.JSONDecodeError:
            return []
    return []

def is_pipeline_busy():
    runs = get_runs()
    for r in runs:
        if r.get("status") in ["in_progress", "queued", "pending"]:
            return True
    return False

def sync_data():
    log("Synchronisation des artefacts et fusion dans site/data...")
    res = run_cmd(f"python3 {ORCHESTRATE_SCRIPT}")
    if res.returncode == 0:
        log("Données fusionnées avec succès.")
    else:
        log(f"Erreur fusion: {res.stderr}")

def trigger_next_batch(batch_idx):
    if batch_idx >= len(WORKLOAD_QUEUE):
        log("Tous les batches de la file ont été exécutés !")
        return False
    target = WORKLOAD_QUEUE[batch_idx]
    eng = target["engines"]
    ds = target["datasets"]
    sc = target["scales"]
    log(f"Lancement du batch {batch_idx + 1}/{len(WORKLOAD_QUEUE)}: {eng} sur {ds}...")
    cmd = f"gh workflow run ci.yml --repo corese-stack/corese-benchmark --ref feature/30-dashboard-v3 -f engines=\"{eng}\" -f datasets=\"{ds}\" -f scales=\"{sc}\" -f quick=false -f force_all_engines=true"
    res = run_cmd(cmd)
    if res.returncode == 0:
        log(f"Batch {eng} déclenché avec succès sur GitHub Actions.")
        return True
    else:
        log(f"Erreur déclenchement {eng}: {res.stderr}")
        return False

def main():
    log("Démarrage du daemon autonome Corese Benchmark pour la journée.")
    current_batch = 2 # 0 et 1 (jena.6.2.0 et corese.4.6.5) sont déjà déclenchés
    
    while True:
        try:
            # 1. Vérifier si des runs sont terminés et fusionner
            sync_data()
            
            # 2. Vérifier si la file CI a de la place
            if not is_pipeline_busy():
                if current_batch < len(WORKLOAD_QUEUE):
                    success = trigger_next_batch(current_batch)
                    if success:
                        current_batch += 1
                else:
                    log("Toutes les campagnes sont achevées et synchronisées. Veille passive.")
            else:
                log("Un run est actuellement en cours ou en file d'attente sur le runner SED.")
                
        except Exception as e:
            log(f"Exception dans la boucle daemon: {e}")
            
        # Pause de 3 minutes entre deux cycles
        time.sleep(180)

if __name__ == "__main__":
    main()
