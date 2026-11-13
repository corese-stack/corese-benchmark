#!/usr/bin/env python3
"""
CLI entry point to prepare benchmark datasets for the Corese Benchmark Suite.

Usage:
    python3 python-utils/prepare_dataset.py <dataset> [scale] [--input-dir <dir>]

Datasets:
    bsbm      Berlin SPARQL Benchmark (scales: small, medium, large)
    lubm      Lehigh University Benchmark (scales: small, medium, large)
    dbpedia   DBpedia 3.5.1 English components sample
    bowlogna  BowlognaBench (scales: small, medium, large)
"""

import argparse
import os
import sys

# Ensure repository root is on sys.path so 'datasets' can be imported reliably
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from datasets import bsbm, lubm, dbpedia, bowlogna

DATASET_HANDLERS = {
    "bsbm": bsbm,
    "lubm": lubm,
    "dbpedia": dbpedia,
    "bowlogna": bowlogna,
}


def main():
    parser = argparse.ArgumentParser(
        description="Prepare benchmark datasets for the Corese Benchmark Suite."
    )
    parser.add_argument(
        "dataset",
        choices=list(DATASET_HANDLERS.keys()),
        help="Name of the dataset to prepare.",
    )
    parser.add_argument(
        "scale",
        nargs="?",
        default=None,
        help="Scale tier (small, medium, large). Ignored for datasets without scale tiers.",
    )
    parser.add_argument(
        "--input-dir",
        default=os.path.abspath("input"),
        help="Target input directory (default: ./input).",
    )

    args = parser.parse_args()
    input_dir = os.path.abspath(args.input_dir)
    handler = DATASET_HANDLERS[args.dataset]

    print(f"Preparing dataset '{args.dataset}' into {input_dir}...")
    if args.dataset == "dbpedia":
        out_dir = handler.prepare(input_dir)
    else:
        scales = [args.scale] if args.scale else ["small"]
        out_dir = handler.prepare(input_dir, scales=scales)

    print(f"Dataset ready at: {out_dir}")


if __name__ == "__main__":
    main()
