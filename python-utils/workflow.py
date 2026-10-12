import os
import sys
import shutil
import subprocess
import argparse
import glob
import json as _json_early
from datetime import datetime

####################################################################################
# Step 0: Parse arguments
####################################################################################

parser = argparse.ArgumentParser(description="Run the corese-benchmark workflow.")
parser.add_argument(
    "--engines",
    type=str,
    default=None,
    help="Comma-separated list of engines (e.g. 'corese.4.6.5,jena.5.2.0,rdf4j.5.1.3')",
)
parser.add_argument(
    "--coreseVersions",
    type=str,
    default=None,
    help="Comma-separated Corese versions (e.g. '4.6.5,local'). One build per version.",
)
parser.add_argument(
    "--coreseCommits",
    type=str,
    default=None,
    help="Comma-separated Corese commit hashes. Clones and builds each commit.",
)
parser.add_argument(
    "--dataset",
    type=str,
    default="dbpedia",
    help="Dataset to benchmark: dbpedia | bsbm | lubm | bowlogna (default: dbpedia)",
)
parser.add_argument(
    "--scales",
    type=str,
    default="small,medium,large",
    help="Comma-separated scale tiers for synthetic datasets: small,medium,large (default: all)",
)
parser.add_argument(
    "--dataDir",
    type=str,
    default=None,
    help="Absolute path to a custom data directory.",
)
parser.add_argument(
    "--coreseLocalPath",
    type=str,
    default=None,
    help="Path to corese-core project or JAR for corese.local engine. "
         "Auto-detected from ../corese-core/build/libs/ if not specified.",
)
parser.add_argument(
    "--inference",
    action="store_true",
    default=False,
    help="Enable RDFS inference for Corese engines (passed to Java harness).",
)
args = parser.parse_args()

current_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(current_dir)
sys.path.insert(0, current_dir)

####################################################################################
# Auto-copy corese.local JAR if needed
####################################################################################

engines_str = args.engines or args.coreseVersions or ""
if "corese.local" in engines_str or "corese.next" in engines_str or "local" in engines_str.split(","):
    libs_dir = os.path.join(project_dir, "libs")
    os.makedirs(libs_dir, exist_ok=True)

    # Resolve source path: --coreseLocalPath > sibling ../corese-core > already in libs/
    if args.coreseLocalPath:
        src = args.coreseLocalPath
        if os.path.isdir(src):
            # Given a project dir — find the jar inside build/libs/
            candidates = glob.glob(os.path.join(src, "build", "libs", "*-jar-with-dependencies.jar"))
            if not candidates:
                candidates = glob.glob(os.path.join(src, "build", "libs", "corese-core*.jar"))
            src = max(candidates, key=os.path.getmtime) if candidates else None
    else:
        # Auto-detect: look in sibling corese-core directory
        sibling = os.path.join(os.path.dirname(project_dir), "corese-core", "build", "libs")
        candidates = glob.glob(os.path.join(sibling, "*-jar-with-dependencies.jar"))
        if not candidates:
            candidates = glob.glob(os.path.join(sibling, "corese-core*.jar"))
        src = max(candidates, key=os.path.getmtime) if candidates else None

    if src and os.path.isfile(src):
        dest = os.path.join(libs_dir, "corese-core-local.jar")
        shutil.copy(src, dest)
        print(f"corese.local: copied JAR from {src}")
    elif not glob.glob(os.path.join(libs_dir, "*.jar")):
        print("WARNING: corese.local requested but no JAR found in libs/ and could not auto-detect.")
        print("  Use --coreseLocalPath /path/to/corese-core or place a JAR in libs/")

if args.dataDir:
    input_dir = os.path.join(args.dataDir, "input")
    out_dir   = os.path.join(args.dataDir, "out")
else:
    input_dir = os.path.join(project_dir, "input")
    out_dir   = os.path.join(project_dir, "out")

out_json_dir = os.path.join(out_dir, "json")
out_csv_dir  = os.path.join(out_dir, "csv")
site_data_dir = os.path.join(project_dir, "site", "data")

os.makedirs(input_dir,    exist_ok=True)
os.makedirs(out_json_dir, exist_ok=True)
os.makedirs(out_csv_dir,  exist_ok=True)
os.makedirs(site_data_dir, exist_ok=True)

gradle_wrapper = os.path.join(
    project_dir, "gradlew.bat" if sys.platform == "win32" else "gradlew"
)
if not os.path.exists(gradle_wrapper):
    raise FileNotFoundError(f"Gradle wrapper not found at {gradle_wrapper}")

####################################################################################
# Step 1: Prepare dataset
####################################################################################

SUPPORTED_DATASETS = ("dbpedia", "bsbm", "lubm", "bowlogna")
dataset_name = args.dataset.lower()

if dataset_name not in SUPPORTED_DATASETS:
    print(f"Unknown dataset '{dataset_name}'. Supported: {', '.join(SUPPORTED_DATASETS)}")
    sys.exit(1)

scales = [s.strip() for s in args.scales.split(",")]

print(f"\n=== Preparing dataset: {dataset_name} (scales: {scales}) ===")

if dataset_name == "dbpedia":
    from datasets.dbpedia import prepare
    unzip_dir = prepare(input_dir)

elif dataset_name == "bsbm":
    from datasets.bsbm import prepare
    unzip_dir = prepare(input_dir, scales=scales)

elif dataset_name == "lubm":
    from datasets.lubm import prepare
    unzip_dir = prepare(input_dir, scales=scales)

elif dataset_name == "bowlogna":
    from datasets.bowlogna import prepare
    unzip_dir = prepare(input_dir, scales=scales)

print(f"Dataset ready at: {unzip_dir}\n")

####################################################################################
# Step 2: Build and run benchmark
####################################################################################

def gradle_build(extra_args=None):
    cmd = [gradle_wrapper, "clean", "build"] + (extra_args or [])
    print(f"Building: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=project_dir, check=True)


QUERIES_FILES = {
    "bowlogna": os.path.join(project_dir, "src", "main", "resources",
                             "Bowlogna_bench_data", "bowlogna-queries.txt"),
    "lubm":     os.path.join(project_dir, "src", "main", "resources",
                             "lubm", "lubm-queries.txt"),
}


def run_benchmark(engines_str, output_file, dataset_label, gradle_props=None):
    queries_file = QUERIES_FILES.get(dataset_label, "")
    args_str = f"{unzip_dir} {output_file} {engines_str} {dataset_label}"
    if queries_file and os.path.exists(queries_file):
        args_str += f" {queries_file}"
        print(f"  Using queries file: {queries_file}")
    if args.inference:
        args_str += " --inference"
        print("  Inference: enabled")
    cmd = [gradle_wrapper, "runBenchmark"] + (gradle_props or []) + [f"--args={args_str}"]
    print(f"Running benchmark: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=project_dir, check=True)


timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

# Case A: --engines (single build, all engines)
if args.engines:
    engines_list = [e.strip() for e in args.engines.split(",")]

    def needs_local_jar(e):
        return e in ('corese.next', 'corese.local') or e.startswith('corese.commit.')

    def build_gradle_props(engine_sublist):
        versions = {}
        for e in engine_sublist:
            parts = e.split(".", 1)
            if len(parts) == 2:
                versions[parts[0]] = parts[1]
        extra = []
        if "corese" in versions:
            corese_ver = versions['corese']
            if corese_ver in ('next', 'local'):
                corese_ver = 'local'
            extra += [f"-PcoreseVersion={corese_ver}"]
        if "jena" in versions:
            extra += [f"-PjenaVersion={versions['jena']}"]
        if "rdf4j" in versions:
            extra += [f"-Prdf4jVersion={versions['rdf4j']}"]
        return extra

    local_engines = [e for e in engines_list if needs_local_jar(e)]
    other_engines = [e for e in engines_list if not needs_local_jar(e)]
    output_file   = os.path.join(out_json_dir, f"{timestamp}_{args.engines.replace(',','_')}.json")

    if local_engines and other_engines:
        # Two incompatible classpaths — run in separate passes then merge
        tmp1 = output_file.replace(".json", "_pass1.json")
        tmp2 = output_file.replace(".json", "_pass2.json")

        extra1 = ["-PcoreseVersion=local"]
        gradle_build(extra1)
        run_benchmark(",".join(local_engines), tmp1, dataset_name, gradle_props=extra1)

        extra2 = build_gradle_props(other_engines)
        gradle_build(extra2)
        run_benchmark(",".join(other_engines), tmp2, dataset_name, gradle_props=extra2)

        # Merge both JSON reports into one
        with open(tmp1) as f: r1 = _json_early.load(f)
        with open(tmp2) as f: r2 = _json_early.load(f)
        merged = {
            "metadata": r1["metadata"],
            "runs": r1["runs"] + r2["runs"],
        }
        if r1.get("queryRuns") or r2.get("queryRuns"):
            merged["queryRuns"] = (r1.get("queryRuns") or []) + (r2.get("queryRuns") or [])
        with open(output_file, "w") as f:
            _json_early.dump(merged, f, indent=2)
        os.remove(tmp1)
        os.remove(tmp2)
        print(f"Merged report: {output_file}")
    else:
        extra = build_gradle_props(engines_list)
        gradle_build(extra)
        run_benchmark(args.engines, output_file, dataset_name, gradle_props=extra)

# Case B: --coreseVersions (one build per version)
if args.coreseVersions:
    for version in args.coreseVersions.split(","):
        version = version.strip()
        gradle_build([f"-PcoreseVersion={version}"])
        engine_name = f"corese.{version}"
        output_file = os.path.join(out_json_dir, f"{timestamp}_{engine_name}.json")
        run_benchmark(engine_name, output_file, dataset_name, gradle_props=[f"-PcoreseVersion={version}"])

# Case C: --coreseCommits (clone + build per commit)
if args.coreseCommits:
    commit_base = os.path.join(args.dataDir or project_dir, "commit")
    for commit_hash in args.coreseCommits.split(","):
        commit_hash = commit_hash.strip()
        commit_dir  = os.path.join(commit_base, commit_hash)
        if os.path.exists(commit_dir):
            shutil.rmtree(commit_dir)
        os.makedirs(commit_dir)

        try:
            subprocess.run(
                ["git", "clone", "https://github.com/corese-stack/corese-core"],
                cwd=commit_dir, check=True
            )
            subprocess.run(
                ["git", "checkout", commit_hash],
                cwd=os.path.join(commit_dir, "corese-core"), check=True
            )
            corese_gradlew = os.path.join(
                commit_dir, "corese-core",
                "gradlew.bat" if sys.platform == "win32" else "gradlew"
            )
            subprocess.run(
                [corese_gradlew, "shadowJar"],
                cwd=os.path.join(commit_dir, "corese-core"), check=True
            )
        except subprocess.CalledProcessError as e:
            print(f"Error building commit {commit_hash}: {e}")
            continue

        libs_path = os.path.join(commit_dir, "corese-core", "build", "libs") + os.sep
        gradle_build([f"-PcoreseCommit={libs_path}"])
        engine_name = f"corese.commit.{commit_hash[:8]}"
        output_file = os.path.join(out_json_dir, f"{timestamp}_{engine_name}.json")
        run_benchmark(engine_name, output_file, dataset_name, gradle_props=[f"-PcoreseCommit={libs_path}"])

    shutil.rmtree(commit_base, ignore_errors=True)

####################################################################################
# Step 3: Copy latest report to site/data/
####################################################################################

json_files = sorted(glob.glob(os.path.join(out_json_dir, "*.json")), key=os.path.getmtime)
if json_files:
    latest = json_files[-1]

    # Copy as current report
    dest = os.path.join(site_data_dir, "benchmark-report.json")
    shutil.copy(latest, dest)
    print(f"\nReport copied to {dest}")

    # Copy CSV alongside JSON
    latest_csv = latest.replace(out_json_dir, out_csv_dir).replace(".json", ".csv")
    if os.path.exists(latest_csv):
        csv_dest = os.path.join(site_data_dir, "benchmark-report.csv")
        shutil.copy(latest_csv, csv_dest)
        print(f"CSV copied to {csv_dest}")

    with open(latest) as f:
        data = f.read()
    with open(os.path.join(site_data_dir, "report-data.js"), "w") as f:
        f.write(f"window.__BENCHMARK_DATA__ = {data};")
    print("Generated report-data.js")

    # Historical trend — copy to site/data/history/ and update index
    history_dir = os.path.join(site_data_dir, "history")
    os.makedirs(history_dir, exist_ok=True)
    hist_filename = f"{timestamp}.json"
    shutil.copy(latest, os.path.join(history_dir, hist_filename))

    # Update history index (keep last 30 entries)
    index_path = os.path.join(history_dir, "index.json")
    if os.path.exists(index_path):
        with open(index_path) as f:
            history_index = _json_early.load(f)
    else:
        history_index = []

    history_index.append({"file": hist_filename, "date": timestamp})
    history_index = history_index[-30:]  # keep last 30

    with open(index_path, "w") as f:
        _json_early.dump(history_index, f, indent=2)
    print(f"History updated: {len(history_index)} entries in {index_path}")

    # Generate history-data.js (inline for file:// compatibility)
    history_data = []
    for entry in history_index:
        hist_file = os.path.join(history_dir, entry["file"])
        if os.path.exists(hist_file):
            with open(hist_file) as hf:
                history_data.append({"date": entry["date"], "data": _json_early.load(hf)})
    hist_js = os.path.join(site_data_dir, "history-data.js")
    with open(hist_js, "w") as f:
        f.write(f"window.__HISTORY_DATA__ = {_json_early.dumps(history_data)};")
    print(f"Generated history-data.js ({len(history_data)} entries)")
else:
    print("No JSON report found in out/")
