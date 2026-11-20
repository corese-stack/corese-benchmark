"""
Dataset preparation helper for named-graphs partitioned from LUBM.
"""

import os
import subprocess


def prepare(input_dir: str, scales=None) -> str:
    """
    Prepare the canonical N-Quads file for named-graphs queries.
    Returns the directory containing the prepared N-Quads dataset.
    """
    _ = scales  # Named-graphs is partitioned from lubm_small; scales parameter accepted for interface uniformity
    output_dir = os.path.join(input_dir, "named-graphs", "unzip")
    os.makedirs(output_dir, exist_ok=True)
    target_nq = os.path.join(output_dir, "corese-feature-lubm.nq")
    named_graphs_nq = os.path.join(output_dir, "named-graphs.nq")

    if not (os.path.exists(target_nq) and os.path.getsize(target_nq) > 0):
        src_nt = os.path.join(input_dir, "lubm", "unzip", "lubm_small.nt")
        if not os.path.exists(src_nt):
            from datasets.lubm import prepare as prepare_lubm
            prepare_lubm(input_dir, scales=["small"])

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

    if not os.path.exists(named_graphs_nq) and os.path.exists(target_nq):
        os.symlink(target_nq, named_graphs_nq)

    return output_dir
