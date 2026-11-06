"""
Berlin SPARQL Benchmark (BSBM) — e-commerce synthetic dataset.
Generator: bsbmtools (Java), generates N-Triples at configurable scale.

Scale tiers (products):
  small  →  1 000 products  (~ 350 K triples, ~90 MB)
  medium →  5 000 products  (~ 1.7 M triples, ~450 MB)
  large  → 30 000 products  (~ 10.5 M triples, ~2.5 GB)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import urllib.request
import zipfile

GENERATOR_URL  = "https://sourceforge.net/projects/bsbmtools/files/latest/download"
GENERATOR_ZIP  = "bsbmtools-0.2.zip"
GENERATOR_DIR  = "bsbmtools-0.2"
GENERATOR_JAR  = "bsbm.jar"   # inside bsbmtools-0.2/lib/

SCALES = {
    "small":  1_000,
    "medium": 5_000,
    "large":  30_000,
}


def _download_generator(tools_dir: str) -> str:
    """Download and unzip bsbmtools if not already present. Returns path to jar."""
    jar_path = os.path.join(tools_dir, GENERATOR_DIR, "lib", GENERATOR_JAR)
    if os.path.exists(jar_path):
        return jar_path

    zip_path = os.path.join(tools_dir, GENERATOR_ZIP)
    if not os.path.exists(zip_path):
        print("  Downloading bsbmtools...")
        urllib.request.urlretrieve(GENERATOR_URL, zip_path)

    print("  Extracting bsbmtools...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(tools_dir)

    if not os.path.exists(jar_path):
        raise FileNotFoundError(f"bsbm.jar not found at {jar_path} after extraction.")

    return jar_path


def _run_generator_for_scale(tools_dir: str, gen_dir: str, scale: str, n_products: int, out_file: str) -> None:
    """Run BSBM generator for a specific scale and move result to out_file."""
    tmp_dir = os.path.join(tools_dir, f"bsbm_gen_{scale}")
    os.makedirs(tmp_dir, exist_ok=True)
    print(f"  Generating BSBM {scale} ({n_products} products)...")

    lib_jars = [
        os.path.join(gen_dir, "lib", f)
        for f in os.listdir(os.path.join(gen_dir, "lib"))
        if f.endswith(".jar")
    ]
    classpath = os.pathsep.join([gen_dir] + lib_jars)
    cmd = [
        "java", "-cp", classpath, "-Xmx256M",
        "benchmark.generator.Generator",
        "-pc", str(n_products),
        "-fc",
        "-fn", "dataset",
        "-s", "nt",
        "-dir", os.path.abspath(tmp_dir),
    ]
    subprocess.run(cmd, cwd=gen_dir, check=True)

    generated = os.path.join(tmp_dir, "dataset.nt")
    if not os.path.exists(generated):
        generated = os.path.join(gen_dir, "dataset.nt")
    if os.path.exists(generated):
        shutil.move(generated, out_file)
        print(f"  Generated: bsbm_{scale}.nt")
    else:
        print(f"  Warning: expected output file not found for scale {scale}.")

    shutil.rmtree(tmp_dir, ignore_errors=True)


def _create_view_dir(input_dir: str, output_dir: str, valid_scales: list[str]) -> str:
    """Create a scoped directory with symlinks/copies for the requested scales."""
    view_dir = os.path.join(input_dir, "bsbm", "view_" + "_".join(valid_scales))
    os.makedirs(view_dir, exist_ok=True)
    for f in os.listdir(view_dir):
        os.remove(os.path.join(view_dir, f))
    for scale in valid_scales:
        src = os.path.join(output_dir, f"bsbm_{scale}.nt")
        dst = os.path.join(view_dir, f"bsbm_{scale}.nt")
        if os.path.exists(src):
            try:
                os.symlink(src, dst)
            except (OSError, NotImplementedError):
                shutil.copy2(src, dst)
    return view_dir


def prepare(input_dir: str, scales: list[str] | None = None) -> str:
    """
    Generate BSBM datasets for the requested scales.
    Returns the directory containing the generated .nt files.
    """
    scales = scales or ["small", "medium", "large"]
    tools_dir = os.path.join(input_dir, "_tools")
    output_dir = os.path.join(input_dir, "bsbm", "unzip")
    os.makedirs(tools_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    _download_generator(tools_dir)
    gen_dir = os.path.abspath(os.path.join(tools_dir, GENERATOR_DIR))

    for scale in scales:
        if scale not in SCALES:
            print(f"  Unknown scale '{scale}', skipping.")
            continue

        out_file = os.path.join(output_dir, f"bsbm_{scale}.nt")
        if os.path.exists(out_file):
            print(f"  Already generated: bsbm_{scale}.nt")
            continue

        _run_generator_for_scale(tools_dir, gen_dir, scale, SCALES[scale], out_file)

    valid_scales = [s for s in scales if s in SCALES]
    if len(valid_scales) == len(SCALES):
        return output_dir

    return _create_view_dir(input_dir, output_dir, valid_scales)
