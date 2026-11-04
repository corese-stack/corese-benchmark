"""
Lehigh University Benchmark (LUBM) — university domain synthetic dataset.
Generator: UBA 1.7 (Java), produces OWL files converted to N-Triples.

Scale tiers (universities):
  small  →  1 university   (~  100 K triples)
  medium →  10 universities (~    1 M triples)
  large  → 100 universities (~   10 M triples)

Note: UBA generates .owl (RDF/XML) files; we convert them to N-Triples with rdflib.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import urllib.request
import zipfile

UBA_URL = "https://swat.cse.lehigh.edu/projects/lubm/uba1.7.zip"
UBA_ZIP = "uba1.7.zip"

SCALES = {
    "small":  1,
    "medium": 10,
    "large":  100,
}


def _download_uba(tools_dir: str) -> str:
    """Download and extract UBA if not already present. Returns path to classes dir."""
    classes_dir = os.path.join(tools_dir, "uba", "classes")
    if os.path.isdir(classes_dir):
        return classes_dir

    zip_path = os.path.join(tools_dir, UBA_ZIP)
    if not os.path.exists(zip_path):
        print("  Downloading UBA 1.7...")
        urllib.request.urlretrieve(UBA_URL, zip_path)

    print("  Extracting UBA 1.7...")
    uba_dir = os.path.join(tools_dir, "uba")
    os.makedirs(uba_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(uba_dir)

    if not os.path.isdir(classes_dir):
        raise FileNotFoundError(f"UBA classes dir not found at {classes_dir}")

    return classes_dir


def _owl_to_nt(owl_file: str, out_f) -> None:
    """Convert an OWL (RDF/XML) file to N-Triples using rdflib and write to out_f."""
    import rdflib
    g = rdflib.Graph()
    g.parse(owl_file, format="xml")
    out_f.write(g.serialize(format="nt").encode("utf-8"))


def _cleanup_uba_windows_files(tools_dir: str, tmp_dir: str, prefix: str) -> None:
    """Move UBA files created with backslash in their name into tmp_dir."""
    for f in os.listdir(tools_dir):
        if f.startswith(prefix) and f.endswith(".owl"):
            clean_name = f[len(prefix):]
            shutil.move(os.path.join(tools_dir, f), os.path.join(tmp_dir, clean_name))

    stray_log = os.path.join(tools_dir, f"{prefix}log.txt")
    if os.path.exists(stray_log):
        os.remove(stray_log)


def _generate_scale_nt(tools_dir: str, classes_dir: str, scale: str, n_univ: int, out_file: str) -> None:
    """Execute UBA generator for a scale and convert resulting OWL files to N-Triples."""
    tmp_dir = os.path.abspath(os.path.join(tools_dir, f"lubm_gen_{scale}"))
    os.makedirs(tmp_dir, exist_ok=True)

    noun = "university" if n_univ == 1 else "universities"
    print(f"  Generating LUBM {scale} ({n_univ} {noun})...")
    cmd = [
        "java", "-cp", classes_dir,
        "edu.lehigh.swat.bench.uba.Generator",
        "-univ", str(n_univ),
        "-index", "0",
        "-seed", "0",
        "-onto", "https://swat.cse.lehigh.edu/onto/univ-bench.owl",
    ]
    subprocess.run(cmd, cwd=tmp_dir, check=True)

    _cleanup_uba_windows_files(tools_dir, tmp_dir, f"lubm_gen_{scale}\\")

    owl_files = sorted(f for f in os.listdir(tmp_dir) if f.endswith(".owl"))
    if not owl_files:
        print(f"  Warning: no .owl files generated for scale {scale}.")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return

    print(f"  Converting {len(owl_files)} OWL file(s) to N-Triples...")
    merged_nt = os.path.join(tmp_dir, "merged.nt")
    with open(merged_nt, "wb") as out_f:
        for owl_name in owl_files:
            _owl_to_nt(os.path.join(tmp_dir, owl_name), out_f)

    shutil.move(merged_nt, out_file)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f"  Generated: lubm_{scale}.nt")


def _create_view_dir(input_dir: str, store_dir: str, valid_scales: list[str]) -> str:
    """Create a scoped directory with symlinks/copies for the requested scales."""
    view_dir = os.path.join(input_dir, "lubm", "view_" + "_".join(valid_scales))
    os.makedirs(view_dir, exist_ok=True)
    for f in os.listdir(view_dir):
        os.remove(os.path.join(view_dir, f))
    for scale in valid_scales:
        src = os.path.join(store_dir, f"lubm_{scale}.nt")
        dst = os.path.join(view_dir,  f"lubm_{scale}.nt")
        if os.path.exists(src):
            try:
                os.symlink(src, dst)
            except (OSError, NotImplementedError):
                shutil.copy2(src, dst)
    return view_dir


def prepare(input_dir: str, scales: list[str] | None = None) -> str:
    """
    Generate LUBM datasets for the requested scales.
    Returns a directory containing ONLY the .nt files for the requested scales,
    so the benchmark harness does not accidentally load larger scale files.
    """
    scales = scales or ["small", "medium", "large"]
    valid_scales = [s for s in scales if s in SCALES]
    tools_dir  = os.path.join(input_dir, "_tools")
    store_dir  = os.path.join(input_dir, "lubm", "unzip")  # permanent per-scale storage
    os.makedirs(tools_dir, exist_ok=True)
    os.makedirs(store_dir, exist_ok=True)

    classes_dir = os.path.abspath(_download_uba(tools_dir))

    for scale in valid_scales:
        n_univ   = SCALES[scale]
        out_file = os.path.join(store_dir, f"lubm_{scale}.nt")

        if os.path.exists(out_file):
            print(f"  Already generated: lubm_{scale}.nt")
            continue

        _generate_scale_nt(tools_dir, classes_dir, scale, n_univ, out_file)

    # Return a view directory containing only the requested scale files.
    if len(valid_scales) == len(SCALES):
        return store_dir

    return _create_view_dir(input_dir, store_dir, valid_scales)
