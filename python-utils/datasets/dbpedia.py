"""
DBpedia 3.5.1 dataset — 5 curated N-Triples files (~270K–770K triples each).
Source: S3 hosted on the SLICES/P16 infrastructure.
"""

import bz2
import os
import shutil

import requests

BASE_URL = "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump"

FILES = [
    "category_labels_en.nt.bz2",
    "disambiguations_en.nt.bz2",
    "homepages_en.nt.bz2",
    "persondata_en.nt.bz2",
    "specific_mappingbased_properties_en.nt.bz2",
]


def prepare(input_dir: str) -> str:
    """Download and extract DBpedia files. Returns the directory of .nt files."""
    archive_dir = os.path.join(input_dir, "dbpedia")
    unzip_dir   = os.path.join(archive_dir, "unzip")
    os.makedirs(archive_dir, exist_ok=True)
    os.makedirs(unzip_dir, exist_ok=True)

    for filename in FILES:
        archive_path = os.path.join(archive_dir, filename)
        nt_name = filename.replace(".bz2", "")
        nt_path = os.path.join(unzip_dir, nt_name)

        if not os.path.exists(archive_path):
            url = f"{BASE_URL}/{filename}"
            print(f"  Downloading {filename}...")
            r = requests.get(url, stream=True)
            r.raise_for_status()
            with open(archive_path, "wb") as f:
                f.writelines(r.iter_content(chunk_size=8192))

        if not os.path.exists(nt_path):
            print(f"  Extracting {filename}...")
            with bz2.BZ2File(archive_path, "rb") as src, open(nt_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
        else:
            print(f"  Already ready: {nt_name}")

    return unzip_dir
