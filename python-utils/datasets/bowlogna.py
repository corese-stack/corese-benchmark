"""
BowlognaBench — student/university relationships synthetic dataset.
Namespace: http://www.owl-ontologies.com/Ontology1324312315.owl#

Reference: https://exascale.info/assets/pdf/BowlognaBenchSIMPDA2011.pdf
Dataset hosted by DICE Research (HOBBIT project):
  https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip

The zip contains Department0.nt … Department9.nt (~1.2 M triples each).

Scale tiers (departments):
  small  →  1 department   (~  1.2 M triples)
  medium →  5 departments  (~  6   M triples)
  large  → 10 departments  (~  12  M triples)
"""

from __future__ import annotations
import os, shutil, urllib.request, zipfile

DUMP_URL = "https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip"
DUMP_ZIP = "bowlogna-dump.zip"

ALL_FILES = [f"Department{i}.nt" for i in range(10)]

SCALES = {
    "small":  ALL_FILES[:1],
    "medium": ALL_FILES[:5],
    "large":  ALL_FILES[:10],
}


def prepare(input_dir: str, scales: list[str] | None = None) -> str:
    """
    Download and extract Bowlogna Department*.nt files for the requested scales.
    Returns the directory containing the .nt files.
    """
    scales = scales or ["small", "medium", "large"]
    output_dir = os.path.join(input_dir, "bowlogna", "unzip")
    os.makedirs(output_dir, exist_ok=True)

    needed_files: set[str] = set()
    for scale in scales:
        if scale not in SCALES:
            print(f"  Unknown scale '{scale}', skipping.")
            continue
        needed_files.update(SCALES[scale])

    missing = [f for f in sorted(needed_files) if not os.path.exists(os.path.join(output_dir, f))]
    if not missing:
        print("  All Bowlogna files already present.")
        return output_dir

    # Download the full dump zip if any file is missing
    zip_path = os.path.join(input_dir, "bowlogna", DUMP_ZIP)
    if not os.path.exists(zip_path):
        print(f"  Downloading bowlogna-dump.zip (~86 MB)...")
        urllib.request.urlretrieve(DUMP_URL, zip_path)
        print("  Download complete.")

    print(f"  Extracting {len(missing)} file(s) from zip...")
    with zipfile.ZipFile(zip_path, "r") as z:
        zip_names = z.namelist()
        for filename in missing:
            # The zip may store files in a subdirectory
            matches = [n for n in zip_names if n.endswith(filename)]
            if not matches:
                print(f"  WARNING: {filename} not found in zip archive.")
                continue
            entry = matches[0]
            dest = os.path.join(output_dir, filename)
            with z.open(entry) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
            print(f"  Extracted: {filename}")

    return output_dir
