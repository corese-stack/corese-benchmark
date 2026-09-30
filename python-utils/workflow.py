import os
import sys
import requests
import zipfile
import tarfile
import bz2
import shutil
import subprocess
import argparse
from datetime import datetime

####################################################################################
# Step 0: Parse arguments and prepare directories
####################################################################################

parser = argparse.ArgumentParser(description="Run the corese-benchmark workflow.")
parser.add_argument(
    "--engines",
    type=str,
    default=None,
    help="Comma-separated list of engines (e.g. 'corese.4.6.3,jena.5.2.0,rdf4j.5.1.3')",
)
parser.add_argument(
    "--coreseVersions",
    type=str,
    default=None,
    help="Comma-separated list of Corese versions (e.g. '4.6.3,local'). Runs one build per version.",
)
parser.add_argument(
    "--coreseCommits",
    type=str,
    default=None,
    help="Comma-separated list of Corese commit hashes (e.g. 'a17f3d6,b089a03').",
)
parser.add_argument(
    "--dataset",
    type=str,
    default="dbpedia",
    help="Dataset name label used in the report (default: dbpedia).",
)
parser.add_argument(
    "--dataDir",
    type=str,
    default=None,
    help="Absolute path to a custom data directory.",
)
args = parser.parse_args()

current_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(current_dir)

if args.dataDir:
    input_dir = os.path.join(args.dataDir, "input")
    out_dir   = os.path.join(args.dataDir, "out")
else:
    input_dir = os.path.join(project_dir, "input")
    out_dir   = os.path.join(project_dir, "out")

site_data_dir = os.path.join(project_dir, "site", "data")

os.makedirs(input_dir, exist_ok=True)
os.makedirs(out_dir, exist_ok=True)
os.makedirs(site_data_dir, exist_ok=True)

gradle_wrapper = os.path.join(project_dir, "gradlew.bat" if sys.platform == "win32" else "gradlew")
if not os.path.exists(gradle_wrapper):
    raise FileNotFoundError(f"Gradle wrapper not found at {gradle_wrapper}")

####################################################################################
# Step 1: Download and extract datasets
####################################################################################

archive_urls = [
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/persondata_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/disambiguations_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/category_labels_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/specific_mappingbased_properties_en.nt.bz2",
    "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/homepages_en.nt.bz2",
]

archive_paths = []
for url in archive_urls:
    name = os.path.basename(url)
    path = os.path.join(input_dir, name)
    archive_paths.append(path)
    if not os.path.exists(path):
        print(f"Downloading {name}...")
        r = requests.get(url, stream=True)
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Downloaded {name}.")
    else:
        print(f"Already exists: {name}")

unzip_dir = os.path.join(input_dir, "unzip")
os.makedirs(unzip_dir, exist_ok=True)
print(f"Extracting to {unzip_dir}...")
for path in archive_paths:
    out_file = os.path.join(unzip_dir, os.path.splitext(os.path.basename(path))[0])
    if os.path.exists(out_file):
        print(f"Already extracted: {os.path.basename(out_file)}")
        continue
    try:
        if path.endswith(".bz2"):
            with bz2.BZ2File(path, "rb") as src, open(out_file, "wb") as dst:
                shutil.copyfileobj(src, dst)
        elif path.endswith(".zip"):
            with zipfile.ZipFile(path, "r") as z:
                z.extractall(unzip_dir)
        elif path.endswith((".tar", ".tar.gz", ".tgz")):
            with tarfile.open(path, "r:*") as t:
                t.extractall(unzip_dir)
        print(f"Extracted: {os.path.basename(path)}")
    except Exception as e:
        print(f"Error extracting {path}: {e}")

####################################################################################
# Step 2: Build and run benchmark
####################################################################################

def gradle_build(extra_args=None):
    cmd = [gradle_wrapper, "clean", "build"] + (extra_args or [])
    print(f"Building: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=project_dir, check=True)

def run_benchmark(engines_str, output_file, dataset_name):
    cmd = [
        gradle_wrapper, "runBenchmark",
        f"--args={unzip_dir} {output_file} {engines_str} {dataset_name}"
    ]
    print(f"Running benchmark: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=project_dir, check=True)

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

# Case A: --engines (single build, all engines)
if args.engines:
    engines_list = args.engines.split(",")
    versions = {}
    for e in engines_list:
        name, ver = e.strip().split(".", 1)
        versions[name] = ver

    extra = []
    if "corese" in versions:
        extra += [f"-PcoreseVersion={versions['corese']}"]
    if "jena" in versions:
        extra += [f"-PjenaVersion={versions['jena']}"]
    if "rdf4j" in versions:
        extra += [f"-Prdf4jVersion={versions['rdf4j']}"]

    gradle_build(extra)
    output_file = os.path.join(out_dir, f"{timestamp}_{args.engines.replace(',','_')}.json")
    run_benchmark(args.engines, output_file, args.dataset)

# Case B: --coreseVersions (one build per version)
if args.coreseVersions:
    versions_list = args.coreseVersions.split(",")
    for version in versions_list:
        version = version.strip()
        gradle_build([f"-PcoreseVersion={version}"])
        engine_name = f"corese.{version}"
        output_file = os.path.join(out_dir, f"{timestamp}_{engine_name}.json")
        run_benchmark(engine_name, output_file, args.dataset)

# Case C: --coreseCommits (clone + build per commit)
if args.coreseCommits:
    commit_base = os.path.join(args.dataDir or project_dir, "commit")
    for commit_hash in args.coreseCommits.split(","):
        commit_hash = commit_hash.strip()
        commit_dir = os.path.join(commit_base, commit_hash)
        if os.path.exists(commit_dir):
            shutil.rmtree(commit_dir)
        os.makedirs(commit_dir)

        try:
            subprocess.run(["git", "clone", "https://github.com/corese-stack/corese-core"],
                           cwd=commit_dir, check=True)
            subprocess.run(["git", "checkout", commit_hash],
                           cwd=os.path.join(commit_dir, "corese-core"), check=True)
            corese_gradlew = os.path.join(commit_dir, "corese-core",
                                          "gradlew.bat" if sys.platform == "win32" else "gradlew")
            subprocess.run([corese_gradlew, "shadowJar"],
                           cwd=os.path.join(commit_dir, "corese-core"), check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error building commit {commit_hash}: {e}")
            continue

        libs_path = os.path.join(commit_dir, "corese-core", "build", "libs") + os.sep
        gradle_build([f"-PcoreseCommit={libs_path}"])
        engine_name = f"corese.commit.{commit_hash}"
        output_file = os.path.join(out_dir, f"{timestamp}_{engine_name}.json")
        run_benchmark(engine_name, output_file, args.dataset)

    shutil.rmtree(commit_base, ignore_errors=True)

####################################################################################
# Step 3: Copy latest report to site/data/
####################################################################################

import glob
import json

json_files = sorted(glob.glob(os.path.join(out_dir, "*.json")))
if json_files:
    latest = json_files[-1]
    dest = os.path.join(site_data_dir, "benchmark-report.json")
    shutil.copy(latest, dest)
    print(f"Report copied to {dest}")

    # Generate report-data.js fallback
    with open(latest) as f:
        data = f.read()
    with open(os.path.join(site_data_dir, "report-data.js"), "w") as f:
        f.write(f"window.__BENCHMARK_DATA__ = {data};")
    print("Generated report-data.js")
else:
    print("No JSON report found in out/")
