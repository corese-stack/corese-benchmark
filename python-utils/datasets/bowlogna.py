"""
BowlognaBench — student/university relationships synthetic dataset.
Namespace: http://www.owl-ontologies.com/Ontology1324312315.owl#

Reference: https://exascale.info/assets/pdf/BowlognaBenchSIMPDA2011.pdf
Dataset hosted by DICE Research (HOBBIT project):
  https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip

Only Department0.nt is extracted.
"""

from __future__ import annotations

from datasets import create_file_view

import os
import shutil
import urllib.request
import zipfile

DUMP_URL = "https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip"
DUMP_ZIP = "bowlogna-dump.zip"

CANONICAL_FILE = "Department0.nt"


def prepare(input_dir: str) -> str:
    """Prepare only the canonical Bowlogna department."""
    dataset_dir = os.path.join(input_dir, "bowlogna")
    output_dir = os.path.join(dataset_dir, "unzip")
    os.makedirs(output_dir, exist_ok=True)
    destination = os.path.join(output_dir, CANONICAL_FILE)
    if not os.path.exists(destination):
        zip_path = os.path.join(dataset_dir, DUMP_ZIP)
        if not os.path.exists(zip_path):
            urllib.request.urlretrieve(DUMP_URL, zip_path)
        with zipfile.ZipFile(zip_path, "r") as archive:
            entry = next(name for name in archive.namelist()
                         if name.rsplit("/", 1)[-1] == CANONICAL_FILE)
            with archive.open(entry) as source, open(destination, "wb") as target:
                shutil.copyfileobj(source, target)
    return create_file_view(os.path.join(dataset_dir, "view_canonical"),
                            output_dir, [CANONICAL_FILE])
