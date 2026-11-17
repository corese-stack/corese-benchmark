#!/usr/bin/env python3
"""Partition one canonical LUBM N-Triples file into two named N-Quads graphs.

No new RDF statements or inference. Blank-node labels retain file scope.
Output must not exist, to avoid overwriting a dataset accidentally.
"""
import argparse
from pathlib import Path
import re

UB = 'http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#'
COURSE_PREDICATES = {f'<{UB}takesCourse>', f'<{UB}teacherOf>'}
PEOPLE_GRAPH = '<urn:corese:benchmark:v1:people>'
COURSES_GRAPH = '<urn:corese:benchmark:v1:courses>'


def prepare(source: Path, destination: Path) -> dict[str, int]:
    counts = {PEOPLE_GRAPH: 0, COURSES_GRAPH: 0}
    with source.open(encoding='utf-8') as src, destination.open('x', encoding='utf-8') as out:
        for number, line in enumerate(src, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            match = re.match(r'^(?:<[^>]*>|_:\S+)\s+(<[^>]*>)\s+.+\s+\.$', line)
            if not match:
                raise ValueError(f'Expected canonical N-Triples at {source}:{number}')
            graph = COURSES_GRAPH if match[1] in COURSE_PREDICATES else PEOPLE_GRAPH
            out.write(f'{line[:-1].rstrip()} {graph} .\n')
            counts[graph] += 1
    return counts


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    for graph, count in prepare(args.source, args.destination).items():
        print(f'{graph}: {count} triples')
