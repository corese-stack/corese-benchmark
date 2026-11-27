"""Parse the benchmark workflow configuration without side effects."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re

CANONICAL_FORMATS = ("nt", "nq", "ttl", "trig", "rdf", "jsonld")
SUPPORTED_DATASETS = ("dbpedia", "bsbm", "lubm", "bowlogna", "named-graphs")
ALIASES = dict(ntriples="nt", nquads="nq", turtle="ttl", rdfxml="rdf",
               **{"rdf/xml": "rdf", "json-ld": "jsonld"})

@dataclass(frozen=True)
class WorkflowConfig:
    engines: tuple[str, ...]
    datasets: tuple[str, ...] = ("dbpedia",)
    formats: tuple[str, ...] | None = None
    mode: str = "all"
    quick: bool = False
    inference: bool = False
    baseline: str = str(Path(__file__).resolve().parents[1] / "site/data/baseline.json")
    reuse: str = "baseline"
    update_baseline: bool = False
    no_export: bool = False
    data_dir: str | None = None
    corese_local_path: str | None = None

    @property
    def is_partial_formats(self):
        return self.formats is not None and len(self.formats) < len(CANONICAL_FORMATS)

    @property
    def effective_reuse(self):
        return "none" if (self.is_partial_formats or self.inference or self.quick) else self.reuse

    @property
    def effective_export(self):
        return not (self.no_export or self.is_partial_formats or self.inference or self.quick)

def _csv(raw, allowed=None, formats=False):
    values = [item.strip().lower() if allowed else item.strip() for item in raw.split(",")]
    if formats:
        values = [ALIASES.get(item.lstrip("."), item.lstrip(".")) for item in values]
    if any(not item or (allowed and item not in allowed) for item in values):
        raise argparse.ArgumentTypeError(f"Invalid CSV value: {raw!r}")
    if not allowed and any(not re.fullmatch(r"(?:corese|jena|rdf4j)\.[A-Za-z0-9]+(?:[.\-+][A-Za-z0-9]+)*", item) for item in values):
        raise argparse.ArgumentTypeError(f"Invalid engine: {raw!r}")
    return tuple(sorted(set(values))) if formats else tuple(dict.fromkeys(values))

def parse_args(argv=None) -> WorkflowConfig:
    """Validate arguments and return an immutable configuration."""
    parser = argparse.ArgumentParser(description="Run the corese-benchmark workflow.", allow_abbrev=False)
    parser.add_argument("--engines", required=True, type=_csv,
                        help="Comma-separated engines (e.g. corese.local,corese.4.6.5,jena.6.2.0,rdf4j.6.1.0).")
    parser.add_argument("--datasets", default="dbpedia", type=lambda s: _csv(s, SUPPORTED_DATASETS),
                        help="Comma-separated datasets: dbpedia, bsbm, lubm, bowlogna, named-graphs.")
    parser.add_argument("--formats", type=lambda s: _csv(s, CANONICAL_FORMATS, formats=True),
                        help="Optional canonical RDF formats subset: nt, nq, ttl, trig, rdf, jsonld.")
    parser.add_argument("--mode", choices=["all", "load", "query"], default="all",
                        help="Execution mode: all (load + query), load, or query (default: all).")
    parser.add_argument("--quick", action="store_true",
                        help="Quick dev run: 1 repetition without warmup.")
    parser.add_argument("--inference", action="store_true", help="Enable OWL-RL inference for Corese engines.")
    parser.add_argument("--baseline", default=WorkflowConfig.baseline,
                        help="Path to frozen immutable reference baseline JSON.")
    parser.add_argument("--reuse", choices=["baseline", "none"], default="baseline",
                        help="Baseline reuse policy: baseline or none (default: baseline).")
    parser.add_argument("--update-baseline", action="store_true",
                        help="Persist freshly measured immutable engine runs into baseline.json.")
    parser.add_argument("--no-export", action="store_true",
                        help="Skip exporting report artifacts to site/data/.")
    parser.add_argument("--data-dir",
                        help="Custom root directory containing input/ and out/ subdirectories.")
    parser.add_argument("--corese-local-path",
                        help="Path to corese-core checkout or JAR for corese.local / corese.next.")
    config = WorkflowConfig(**vars(parser.parse_args(argv)))
    if config.update_baseline and (
        config.quick or config.mode != "all" or config.is_partial_formats or config.no_export or config.inference
    ):
        parser.error("--update-baseline requires --mode all, full formats, export enabled, and no --quick or --inference")
    return config
