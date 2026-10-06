"""
Berlin SPARQL Benchmark (BSBM) — e-commerce synthetic dataset.
Generator: bsbmtools (Java), generates N-Triples at configurable scale.

Scale tiers (products):
  small  →  1 000 products  (~  50 000 triples)
  medium →  50 000 products  (~   1 M  triples)
  large  → 500 000 products  (~  10 M  triples)
"""

from __future__ import annotations
import os, subprocess, shutil, urllib.request, zipfile

GENERATOR_URL  = "https://sourceforge.net/projects/bsbmtools/files/latest/download"
GENERATOR_ZIP  = "bsbmtools-0.2.zip"
GENERATOR_DIR  = "bsbmtools-0.2"
GENERATOR_JAR  = "bsbm.jar"   # inside bsbmtools-0.2/lib/

SCALES = {
    "small":  1_000,
    "medium": 50_000,
    "large":  500_000,
}


def _download_generator(tools_dir: str) -> str:
    """Download and unzip bsbmtools if not already present. Returns path to jar."""
    jar_path = os.path.join(tools_dir, GENERATOR_DIR, "lib", GENERATOR_JAR)
    if os.path.exists(jar_path):
        return jar_path

    zip_path = os.path.join(tools_dir, GENERATOR_ZIP)
    if not os.path.exists(zip_path):
        print(f"  Downloading bsbmtools...")
        urllib.request.urlretrieve(GENERATOR_URL, zip_path)

    print(f"  Extracting bsbmtools...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(tools_dir)

    if not os.path.exists(jar_path):
        raise FileNotFoundError(f"bsbm.jar not found at {jar_path} after extraction.")

    return jar_path


def prepare(input_dir: str, scales: list[str] | None = None) -> str:
    """
    Generate BSBM datasets for the requested scales.
    Returns the directory containing the generated .nt files.
    """
    scales = scales or ["small", "medium", "large"]
    tools_dir  = os.path.join(input_dir, "_tools")
    output_dir = os.path.join(input_dir, "bsbm", "unzip")
    os.makedirs(tools_dir,  exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    jar = _download_generator(tools_dir)

    for scale in scales:
        if scale not in SCALES:
            print(f"  Unknown scale '{scale}', skipping.")
            continue

        n_products = SCALES[scale]
        out_file   = os.path.join(output_dir, f"bsbm_{scale}.nt")

        if os.path.exists(out_file):
            print(f"  Already generated: bsbm_{scale}.nt")
            continue

        # bsbmtools generates dataset.nt in the current directory
        tmp_dir = os.path.join(tools_dir, f"bsbm_gen_{scale}")
        os.makedirs(tmp_dir, exist_ok=True)

        print(f"  Generating BSBM {scale} ({n_products} products)...")
        gen_dir = os.path.abspath(os.path.join(tools_dir, GENERATOR_DIR))
        lib_jars = [
            os.path.join(gen_dir, "lib", f)
            for f in os.listdir(os.path.join(gen_dir, "lib"))
            if f.endswith(".jar")
        ]
        classpath = os.pathsep.join([gen_dir] + lib_jars)
        tmp_dir_abs = os.path.abspath(tmp_dir)
        cmd = [
            "java", "-cp", classpath, "-Xmx256M",
            "benchmark.generator.Generator",
            "-pc", str(n_products),
            "-fc",             # flat categories
            "-fn", "dataset",  # output file prefix
            "-s", "nt",        # N-Triples format
            "-dir", tmp_dir_abs,  # output directory
        ]
        # Must run from gen_dir so titlewords.txt is found
        subprocess.run(cmd, cwd=gen_dir, check=True)

        generated = os.path.join(tmp_dir, "dataset.nt")
        if os.path.exists(generated):
            shutil.move(generated, out_file)
            print(f"  Generated: bsbm_{scale}.nt")
        else:
            print(f"  Warning: expected output file not found for scale {scale}.")

        shutil.rmtree(tmp_dir, ignore_errors=True)

    return output_dir
