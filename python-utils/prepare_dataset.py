#!/usr/bin/env python3
"""
CLI entry point to prepare benchmark datasets for the Corese Benchmark Suite.

Usage:
    python3 python-utils/prepare_dataset.py <dataset> [--input-dir <dir>]

Datasets:
    bsbm      Berlin SPARQL Benchmark (medium loading input and small query input)
    lubm      Lehigh University Benchmark (medium loading input and small query input)
    dbpedia   DBpedia 3.5.1 English components sample
    bowlogna  BowlognaBench (medium loading input and small query input)
    named-graphs  Named graph partitions from LUBM small
"""

from __future__ import annotations

import argparse
import os
import sys

# Ensure repository root is on sys.path so 'datasets' can be imported reliably
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from datasets import bsbm, lubm, dbpedia, bowlogna, named_graphs

DATASET_HANDLERS = {
    "bsbm": bsbm,
    "lubm": lubm,
    "dbpedia": dbpedia,
    "bowlogna": bowlogna,
    "named-graphs": named_graphs,
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
        "--input-dir",
        default=os.path.abspath("input"),
        help="Target input directory (default: ./input).",
    )

    args = parser.parse_args()
    input_dir = os.path.abspath(args.input_dir)
    handler = DATASET_HANDLERS[args.dataset]

    print(f"Preparing dataset '{args.dataset}' into {input_dir}...")
    out_dir = handler.prepare(input_dir)

    print(f"Dataset ready at: {out_dir}")


if __name__ == "__main__":
    main()
