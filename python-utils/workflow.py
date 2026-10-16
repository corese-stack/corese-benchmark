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
    default=None,
    help="Single dataset to benchmark: dbpedia | bsbm | lubm | bowlogna (default: dbpedia)",
)
parser.add_argument(
    "--datasets",
    type=str,
    default=None,
    help="Comma-separated datasets to benchmark in one run (e.g. 'dbpedia,bowlogna,bsbm,lubm')",
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

# Resolve dataset list: --datasets takes priority over --dataset
if args.datasets:
    dataset_names = [d.strip().lower() for d in args.datasets.split(",")]
elif args.dataset:
    dataset_names = [args.dataset.strip().lower()]
else:
    dataset_names = ["dbpedia"]

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
            candidates = glob.glob(os.path.join(src, "build", "libs", "*-jar-with-dependencies.jar"))
            if not candidates:
                candidates = glob.glob(os.path.join(src, "build", "libs", "corese-core*.jar"))
            src = max(candidates, key=os.path.getmtime) if candidates else None
    else:
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

out_json_dir  = os.path.join(out_dir, "json")
out_csv_dir   = os.path.join(out_dir, "csv")
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
# Step 1: Prepare datasets
####################################################################################

SUPPORTED_DATASETS = ("dbpedia", "bsbm", "lubm", "bowlogna")
scales = [s.strip() for s in args.scales.split(",")]

for ds in dataset_names:
    if ds not in SUPPORTED_DATASETS:
        print(f"Unknown dataset '{ds}'. Supported: {', '.join(SUPPORTED_DATASETS)}")
        sys.exit(1)

def prepare_dataset(dataset_name):
    print(f"\n=== Preparing dataset: {dataset_name} (scales: {scales}) ===")
    if dataset_name == "dbpedia":
        from datasets.dbpedia import prepare
        return prepare(input_dir)
    elif dataset_name == "bsbm":
        from datasets.bsbm import prepare
        return prepare(input_dir, scales=scales)
    elif dataset_name == "lubm":
        from datasets.lubm import prepare
        return prepare(input_dir, scales=scales)
    elif dataset_name == "bowlogna":
        from datasets.bowlogna import prepare
        return prepare(input_dir, scales=scales)

# Pre-prepare all datasets upfront
dataset_dirs = {}
for ds in dataset_names:
    dataset_dirs[ds] = prepare_dataset(ds)
    print(f"Dataset ready at: {dataset_dirs[ds]}")

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


def run_benchmark(engines_str, output_file, dataset_label, unzip_dir, gradle_props=None):
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


def merge_json_files(file_list, output_file):
    """Merge multiple JSON reports into one, combining runs and queryRuns arrays.
    metadata.queries is taken from whichever report contains them (queries are
    dataset-specific, so only one report per dataset will have them).
    """
    merged = None
    merged_queries = None  # SPARQL query texts from metadata
    for path in file_list:
        with open(path) as f:
            r = _json_early.load(f)
        # Collect SPARQL query texts from metadata (any report that has them)
        q = r.get("metadata", {}).get("queries")
        if q:
            merged_queries = q
        if merged is None:
            merged = {
                "metadata": r["metadata"],
                "runs": list(r.get("runs", [])),
                "queryRuns": list(r.get("queryRuns", [])),
            }
        else:
            merged["runs"]      += r.get("runs", [])
            merged["queryRuns"] += r.get("queryRuns", [])
    if merged:
        # Ensure metadata.queries is preserved from any contributing report
        if merged_queries:
            merged["metadata"]["queries"] = merged_queries
        if not merged["queryRuns"]:
            del merged["queryRuns"]
    with open(output_file, "w") as f:
        _json_early.dump(merged, f, indent=2)
    for path in file_list:
        os.remove(path)
    print(f"Merged report: {output_file}")


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
    engines_tag   = args.engines.replace(',', '_')

    # Collect one output file per dataset (then merge if multi-dataset)
    dataset_output_files = []

    for ds in dataset_names:
        unzip_dir   = dataset_dirs[ds]
        ds_tag      = f"_{ds}" if len(dataset_names) > 1 else ""
        output_file = os.path.join(out_json_dir, f"{timestamp}{ds_tag}_{engines_tag}.json")

        if local_engines and other_engines:
            tmp1 = output_file.replace(".json", "_pass1.json")
            tmp2 = output_file.replace(".json", "_pass2.json")

            extra1 = ["-PcoreseVersion=local"]
            gradle_build(extra1)
            run_benchmark(",".join(local_engines), tmp1, ds, unzip_dir, gradle_props=extra1)

            extra2 = build_gradle_props(other_engines)
            gradle_build(extra2)
            run_benchmark(",".join(other_engines), tmp2, ds, unzip_dir, gradle_props=extra2)

            merge_json_files([tmp1, tmp2], output_file)
        else:
            extra = build_gradle_props(engines_list)
            gradle_build(extra)
            run_benchmark(args.engines, output_file, ds, unzip_dir, gradle_props=extra)

        dataset_output_files.append(output_file)

    # If multiple datasets, merge all into one final report
    if len(dataset_output_files) > 1:
        final_output = os.path.join(out_json_dir, f"{timestamp}_all_{engines_tag}.json")
        merge_json_files(dataset_output_files, final_output)
    # (single dataset file already at output_file)

# Case B: --coreseVersions (one build per version)
if args.coreseVersions:
    for version in args.coreseVersions.split(","):
        version     = version.strip()
        engine_name = f"corese.{version}"
        ds_files    = []
        for ds in dataset_names:
            unzip_dir   = dataset_dirs[ds]
            ds_tag      = f"_{ds}" if len(dataset_names) > 1 else ""
            output_file = os.path.join(out_json_dir, f"{timestamp}{ds_tag}_{engine_name}.json")
            gradle_build([f"-PcoreseVersion={version}"])
            run_benchmark(engine_name, output_file, ds, unzip_dir, gradle_props=[f"-PcoreseVersion={version}"])
            ds_files.append(output_file)
        if len(ds_files) > 1:
            merge_json_files(ds_files, os.path.join(out_json_dir, f"{timestamp}_all_{engine_name}.json"))

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

        libs_path   = os.path.join(commit_dir, "corese-core", "build", "libs") + os.sep
        engine_name = f"corese.commit.{commit_hash[:8]}"
        ds_files    = []
        for ds in dataset_names:
            unzip_dir   = dataset_dirs[ds]
            ds_tag      = f"_{ds}" if len(dataset_names) > 1 else ""
            output_file = os.path.join(out_json_dir, f"{timestamp}{ds_tag}_{engine_name}.json")
            gradle_build([f"-PcoreseCommit={libs_path}"])
            run_benchmark(engine_name, output_file, ds, unzip_dir, gradle_props=[f"-PcoreseCommit={libs_path}"])
            ds_files.append(output_file)
        if len(ds_files) > 1:
            merge_json_files(ds_files, os.path.join(out_json_dir, f"{timestamp}_all_{engine_name}.json"))

    shutil.rmtree(commit_base, ignore_errors=True)

####################################################################################
# Step 3: Copy latest report to site/data/
####################################################################################

json_files = sorted(glob.glob(os.path.join(out_json_dir, "*.json")), key=os.path.getmtime)
if json_files:
    latest = json_files[-1]

    dest = os.path.join(site_data_dir, "benchmark-report.json")
    shutil.copy(latest, dest)
    print(f"\nReport copied to {dest}")

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

    history_dir = os.path.join(site_data_dir, "history")
    os.makedirs(history_dir, exist_ok=True)
    hist_filename = f"{timestamp}.json"
    shutil.copy(latest, os.path.join(history_dir, hist_filename))

    index_path = os.path.join(history_dir, "index.json")
    if os.path.exists(index_path):
        with open(index_path) as f:
            history_index = _json_early.load(f)
    else:
        history_index = []

    history_index.append({"file": hist_filename, "date": timestamp})
    history_index = history_index[-30:]

    with open(index_path, "w") as f:
        _json_early.dump(history_index, f, indent=2)
    print(f"History updated: {len(history_index)} entries in {index_path}")

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
