#!/usr/bin/env python3
"""Check Maven Central for new stable releases of Jena and RDF4J."""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

SEARCH_URL = "https://search.maven.org/solrsearch/select"
DEFAULT_BASELINE = "site/data/baseline.json"
ARTIFACTS = {
    "jena": ("org.apache.jena", "jena-arq"),
    "rdf4j": ("org.eclipse.rdf4j", "rdf4j-storage"),
}

_UNSTABLE = re.compile(
    r"(?:^|[.\-_])(snapshot|alpha|beta|rc|m|cr|milestone|dev|preview|pre|ea)\d*(?:$|[.\-_])",
    re.IGNORECASE,
)
_VERSION_RE = re.compile(r"\b\d+\.\d+(?:\.\d+)*\b")


def log(verbose, message):
    if verbose:
        print(message, file=sys.stderr)


def is_stable(version):
    return bool(re.match(r"\d", version)) and not _UNSTABLE.search(version)


def version_key(version):
    return tuple(int(n) for n in re.findall(r"\d+", version))


def fetch_versions(group, artifact, timeout=15):
    query = urllib.parse.urlencode(
        {
            "q": f'g:"{group}" AND a:"{artifact}"',
            "core": "gav",
            "rows": "200",
            "wt": "json",
        }
    )
    request = urllib.request.Request(
        f"{SEARCH_URL}?{query}", headers={"User-Agent": "check-new-releases/1.0"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return [doc["v"] for doc in payload.get("response", {}).get("docs", []) if "v" in doc]


def latest_stable(versions):
    stable = [v for v in versions if is_stable(v)]
    return max(stable, key=version_key) if stable else None


def _engine_key(name):
    lowered = str(name).lower()
    for key in ARTIFACTS:
        if key in lowered:
            return key
    return None


def _extract_versions(value):
    if isinstance(value, str):
        return set(_VERSION_RE.findall(value))
    if isinstance(value, dict):
        return _extract_versions(value.get("version", ""))
    if isinstance(value, list):
        found = set()
        for item in value:
            found |= _extract_versions(item)
        return found
    return set()


def baseline_versions(engines):
    """Return {engine_key: set(versions)} from metadata.engines (dict or list)."""
    result = {key: set() for key in ARTIFACTS}
    if isinstance(engines, dict):
        items = engines.items()
    elif isinstance(engines, list):
        items = []
        for e in engines:
            if isinstance(e, dict):
                items.append((e.get("name") or e.get("id") or e.get("engine") or "", e))
            elif isinstance(e, str):
                items.append((e, e))
    else:
        items = []
    for name, value in items:
        key = _engine_key(name)
        if key:
            result[key] |= _extract_versions(value)
    return result


def load_baseline(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return baseline_versions(data.get("metadata", {}).get("engines", {}))


def compare(baseline, fetcher=fetch_versions, verbose=False):
    report = {}
    for key, (group, artifact) in ARTIFACTS.items():
        versions = fetcher(group, artifact)
        latest = latest_stable(versions)
        known = baseline.get(key, set())
        current = max(known, key=version_key) if known else None
        log(verbose, f"{key}: {len(versions)} versions fetched, latest stable={latest}")
        missing = latest is not None and (
            current is None or version_key(latest) > version_key(current)
        )
        report[key] = {
            "artifact": f"{group}:{artifact}",
            "latest": latest,
            "baseline": current,
            "missing": missing,
        }
    return report


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default=DEFAULT_BASELINE, help="path to baseline.json")
    parser.add_argument("--check", action="store_true", help="exit 1 if a new release is missing")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--verbose", action="store_true", help="log details to stderr")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        log(args.verbose, f"Loading baseline {args.baseline}")
        baseline = load_baseline(args.baseline)
        report = compare(baseline, verbose=args.verbose)
    except (OSError, ValueError) as exc:  # includes URLError, JSONDecodeError
        print(f"error: {exc}", file=sys.stderr)
        return 2

    missing = [k for k, v in report.items() if v["missing"]]
    if args.json:
        print(json.dumps({"engines": report, "missing": missing}, indent=2))
    else:
        for key, info in report.items():
            status = "NEW" if info["missing"] else "up-to-date"
            print(
                f"{key} ({info['artifact']}): baseline={info['baseline']} "
                f"latest={info['latest']} [{status}]"
            )
    return 1 if args.check and missing else 0


if __name__ == "__main__":
    sys.exit(main())
