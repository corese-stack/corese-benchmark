"""Prepare inputs and execute compatible Gradle batches."""
from __future__ import annotations

import importlib
import os
from pathlib import Path
import shlex
import shutil
import subprocess

from workflow_cli import SUPPORTED_DATASETS

MULTI_FORMAT_DATASETS = frozenset({"bowlogna", "dbpedia", "lubm"})

PROJECT_DIR = Path(__file__).resolve().parents[1]
QUERIES_FILES = {ds: str(PROJECT_DIR / "input/queries/v1/catalogue.json") for ds in SUPPORTED_DATASETS}


def ensure_java_home():
    """Use an installed supported JDK when JAVA_HOME is unset."""
    if "JAVA_HOME" in os.environ:
        return
    candidates = [*Path.home().glob(".gradle/jdks/*25*"), *Path.home().glob(".gradle/jdks/*21*"),
                  *Path("/usr/lib/jvm").glob("*25*"), *Path("/usr/lib/jvm").glob("*21*")]
    for candidate in candidates:
        if (candidate / "bin/java").is_file():
            os.environ["JAVA_HOME"] = str(candidate)
            os.environ["PATH"] = f"{candidate}/bin:{os.environ.get('PATH', '')}"
            return


def resolve_paths(project_dir, data_dir):
    """Resolve input and output storage."""
    project = Path(project_dir)
    if data_dir:
        return Path(data_dir) / "input", Path(data_dir) / "out"
    candidates = [os.environ.get("BENCHMARK_INPUT_DIR"), "/media/storage/benchmark_data/input"]
    input_dir = next((Path(p) for p in candidates if p and Path(p).is_dir()), project / "input")
    return input_dir, project / "out"


def _resolve_checkout_jar(source: Path):
    """Locate a built Corese JAR from a file path or corese-core checkout."""
    if source.is_file():
        return source
    if source.is_dir():
        libs = source / "build/libs"
        jars = list(libs.glob("*-jar-with-dependencies.jar")) or list(libs.glob("corese-core*.jar"))
        if jars:
            return max(jars, key=lambda p: p.stat().st_mtime)
    return None


def sync_local_corese_jar(project_dir, engines, corese_local_path):
    """Copy fresh local Corese JAR, falling back to pre-staged libs/ JAR when no checkout exists."""
    if not set(engines) & {"corese.local", "corese.next"}:
        return
    project = Path(project_dir)
    dest = project / "libs/corese-core-local.jar"
    source = Path(corese_local_path) if corese_local_path else project.parent / "corese-core"
    resolved = _resolve_checkout_jar(source)
    if resolved is not None:
        dest.parent.mkdir(exist_ok=True)
        if resolved.resolve() != dest.resolve():
            shutil.copy2(resolved, dest)
        return
    if corese_local_path or not dest.is_file():
        raise FileNotFoundError(f"No Corese JAR found in {source}" + ("" if corese_local_path else f" or {dest}"))


def clean_engine_version(raw_ver):
    for suffix in (".tdb2", ".tdb1", ".native", ".lmdb", ".mem"):
        if raw_ver.endswith(suffix):
            return raw_ver[:-len(suffix)]
    return raw_ver


def _engine_version(engine):
    family, version = engine.split(".", 1)
    version = clean_engine_version(version)
    return family, "local" if family == "corese" and version in ("local", "next") else version


def plan_gradle_batches(engines: list[str]):
    """Pack engines into the minimum number of version-compatible builds."""
    batches, versions = [], []
    for engine in engines:
        family, version = _engine_version(engine)
        index = next((i for i, mapping in enumerate(versions)
                      if family not in mapping or mapping[family] == version), len(batches))
        if index == len(batches):
            batches.append([])
            versions.append({})
        batches[index].append(engine)
        versions[index][family] = version
    return batches


def gradle_props_for_batch(batch):
    versions = {}
    for engine in batch:
        family, version = _engine_version(engine)
        if family in versions and versions[family] != version:
            raise ValueError(f"Conflicting {family} versions in batch")
        versions[family] = version
    return [f"-P{family}Version={version}" for family, version in versions.items()]


def prepare_datasets(datasets, input_dir):
    dirs = {}
    for dataset in datasets:
        module = importlib.import_module(f"datasets.{dataset.replace('-', '_')}")
        dirs[dataset] = module.prepare(str(input_dir))
    return dirs


def convert_datasets_for_run(gradle_wrapper, project_dir, dirs, mode, formats):
    if mode == "query" or formats == ("nt",):
        print(f"[convert] Skipping conversion (mode={mode}, formats={formats}); prepared NT/NQ inputs")
        return
    targets = (target for dataset, target in dirs.items() if dataset in MULTI_FORMAT_DATASETS) if isinstance(dirs, dict) else dirs
    for target in sorted(set(targets)):
        args = [str(target)]
        if formats:
            args.append(f"--formats={','.join(formats)}")
        subprocess.run([str(gradle_wrapper), "convertDatasets", f"--args={shlex.join(args)}"],
                       cwd=project_dir, check=True)


def gradle_build(project_dir, gradle_wrapper, gradle_props=None):
    subprocess.run([str(gradle_wrapper), "clean", "build", *(gradle_props or [])],
                   cwd=project_dir, check=True, timeout=600)


def run_benchmark(project_dir, gradle_wrapper, engines, output_file, dataset_label, unzip_dir,
                  config, gradle_props=None):
    args = [str(unzip_dir), str(output_file), engines if isinstance(engines, str) else ','.join(engines), dataset_label]
    if config.mode != "load":
        args.append(QUERIES_FILES[dataset_label])
    args.extend(["--mode", config.mode])
    if config.formats:
        args.extend(["--formats", ','.join(config.formats)])
    args.extend(flag for flag, enabled in (("--quick", config.quick), ("--inference", config.inference)) if enabled)
    subprocess.run([str(gradle_wrapper), "runBenchmark", *(gradle_props or []), f"--args={shlex.join(args)}"],
                   cwd=project_dir, check=True, timeout=7200)
