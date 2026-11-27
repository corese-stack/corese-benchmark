#!/usr/bin/env python3
"""Publish catalogue v1 and exact .rq sources into the standalone static site."""
import argparse
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repository', type=Path, default=Path(__file__).resolve().parents[2])
args = parser.parse_args()
source = args.repository / 'input/queries/v1'
target = Path(__file__).resolve().parents[1] / 'data/sparql/v1'
catalogue = json.loads((source / 'catalogue.json').read_text())
# Validate everything before publishing any file.
files = []
for query in catalogue['queries']:
    relative = Path(query['file'])
    path = (source / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(source.resolve()) or path.suffix != '.rq':
        raise ValueError(f'Invalid source path: {relative}')
    files.append((relative, path.read_bytes()))
target.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source / 'catalogue.json', target / 'catalogue.json')
for relative, content in files:
    destination = target / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
print(f'Published catalogue and {len(files)} original SPARQL queries to {target}')
