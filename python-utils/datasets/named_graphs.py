"""
Dataset preparation helper for named-graphs partitioned from LUBM.
"""

from __future__ import annotations

import os
import subprocess
import shutil
import tempfile


def prepare(input_dir: str) -> str:
    """
    Prepare the canonical N-Quads file for named-graphs queries.
    Returns the directory containing the prepared N-Quads dataset.
    """
    output_dir = os.path.join(input_dir, "named-graphs", "unzip")
    os.makedirs(output_dir, exist_ok=True)
    target_nq = os.path.join(output_dir, "corese-feature-lubm.nq")
    named_graphs_nq = os.path.join(output_dir, "named-graphs.nq")

    if os.path.islink(target_nq):
        _materialize(target_nq, output_dir)

    if not (os.path.exists(target_nq) and os.path.getsize(target_nq) > 0):
        src_nt = os.path.join(input_dir, "lubm", "unzip", "lubm_small.nt")
        if not os.path.exists(src_nt):
            from datasets.lubm import prepare as prepare_lubm
            prepare_lubm(input_dir)

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        prep_script = os.path.join(
            os.path.dirname(base_dir),
            "input",
            "queries",
            "v1",
            "named-graphs",
            "prepare_dataset.py",
        )
        subprocess.run(["python3", prep_script, src_nt, target_nq], check=True)

    if os.path.lexists(named_graphs_nq):
        os.unlink(named_graphs_nq)

    return output_dir


def _materialize(path: str, directory: str) -> None:
    """Replace a symlink only after its dereferenced content is safely copied."""
    descriptor, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as target, open(path, "rb") as source:
            shutil.copyfileobj(source, target)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
