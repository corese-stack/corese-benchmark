"""Validate, merge and export Java reports while preserving existing Java verdicts."""
from __future__ import annotations

import json
import os
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
import baseline

def resolve_git_commit(project_dir=None):
    """Resolve current git commit hash for benchmark traceability."""
    env_sha = os.environ.get("GITHUB_SHA")
    if env_sha and len(env_sha) >= 7:
        return env_sha.strip()
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=True
        )
        sha = res.stdout.strip()
        if sha:
            return sha
    except (OSError, subprocess.CalledProcessError):
        pass
    return None

def _validate_run_list(val: list, key: str, source_path: str) -> None:
    """Validate that val is a list of dictionaries."""
    if not isinstance(val, list):
        raise RuntimeError(f"Report at {source_path} has non-list '{key}' field: {type(val).__name__}")
    for idx, item in enumerate(val):
        if not isinstance(item, dict):
            raise RuntimeError(f"Report at {source_path} has non-dict entry in '{key}' at index {idx}")


def validate_single_report_dict(r: dict, source_path: str = "") -> None:
    """Strictly assert that a report dict has valid metadata and well-formed runs."""
    if not isinstance(r, dict):
        raise RuntimeError(f"Report at {source_path} is not a valid JSON dictionary")

    metadata = r.get("metadata")
    if not isinstance(metadata, dict):
        raise RuntimeError(f"Report at {source_path} has missing or invalid 'metadata' object")

    valid_counts = 0
    for key in ("runs", "loadingRuns", "queryRuns"):
        if key in r:
            val = r[key]
            _validate_run_list(val, key, source_path)
            valid_counts += len(val)

    if valid_counts == 0:
        raise RuntimeError(f"Report at {source_path} contains zero valid runs (empty runs, loadingRuns, and queryRuns)")


def extract_report_entries(r: dict, source_path: str = "") -> tuple[list, list]:
    """Helper to extract loading runs and query runs from a report dict."""
    validate_single_report_dict(r, source_path)
    runs = list(baseline.loading_runs(r))
    qruns = list(r.get("queryRuns", []))
    return runs, qruns


def _cross_validate_query_group(peers: list[dict]) -> None:
    """Compare PASS peers against a clear consensus, or symmetrically on ties."""
    if len(peers) < 2:
        return
    counts = Counter((row["rowCount"], row["resultHash"]) for row in peers)
    ranked = counts.most_common()
    consensus, count = ranked[0]
    clear_consensus = count >= 2 and (len(ranked) == 1 or count > ranked[1][1])
    reference = [row for row in peers
                 if (row["rowCount"], row["resultHash"]) == consensus] if clear_consensus else peers
    has_blank_nodes = any(row.get("hasBlankNodes") for row in reference)
    row_counts = {row["rowCount"] for row in reference}
    hashes = {row["resultHash"] for row in reference}
    for row in peers:
        if clear_consensus and (row["rowCount"], row["resultHash"]) == consensus:
            continue
        if row_counts != {row["rowCount"]}:
            row["status"] = "MISMATCH"
        elif hashes != {row["resultHash"]}:
            row["status"] = "INCONCLUSIVE" if row.get("hasBlankNodes") or has_blank_nodes else "MISMATCH"


def cross_validate_merged_queries(query_runs: list[dict]) -> None:
    """Cross-check fresh and cached comparable queries without replacing Java verdicts."""
    groups = defaultdict(list)
    for row in query_runs:
        if (row.get("status") == "PASS" and row.get("resultHash")
                and isinstance(row.get("rowCount"), int) and row["rowCount"] >= 0):
            groups[(row.get("dataset"), row.get("queryId"))].append(row)
    for peers in groups.values():
        engine_counts = Counter(row.get("engine") for row in peers)
        unique_peers = [row for row in peers if engine_counts[row.get("engine")] == 1]
        _cross_validate_query_group(unique_peers)


def _finalize_merged_report(merged):
    """Enrich merged report with generated timestamp and git commit SHA."""
    if not merged["queryRuns"]:
        del merged["queryRuns"]
    merged["metadata"]["generatedAt"] = datetime.now(timezone.utc).isoformat()
    git_sha = resolve_git_commit()
    if git_sha and "gitCommit" not in merged["metadata"]:
        merged["metadata"]["gitCommit"] = git_sha


def _merge_metadata_inplace(target: dict, incoming: dict) -> dict:
    """Merge metadata dicts preserving nested datasetSizes maps."""
    sizes = dict(target.get("datasetSizes", {}))
    sizes.update(incoming.get("datasetSizes", {}))
    target.update({key: value for key, value in incoming.items()
                   if key not in ("queries", "datasetQueries")})
    if sizes:
        target["datasetSizes"] = sizes
    return target


def merge_json_files(file_list, output_file, no_delete=None):
    """Merge reports, validating output before removing consumed inputs."""
    merged = None
    for path in file_list:
        with open(path) as f:
            r = json.load(f)
        runs, qruns = extract_report_entries(r, source_path=path)
        if merged is None:
            merged = {
                "metadata": _merge_metadata_inplace({}, r["metadata"]),
                "loadingRuns": list(runs),
                "queryRuns": qruns,
            }
        else:
            _merge_metadata_inplace(merged["metadata"], r["metadata"])
            merged["loadingRuns"] += runs
            merged["queryRuns"] += qruns

    if merged is None:
        raise RuntimeError("No valid report generated by current run")
    cross_validate_merged_queries(merged["queryRuns"])
    _finalize_merged_report(merged)

    with open(output_file, "w") as f:
        json.dump(merged, f, indent=2)

    with open(output_file, encoding="utf-8") as stream:
        validate_single_report_dict(json.load(stream), output_file)

    _keep = set(no_delete or []) | {output_file}
    for path in file_list:
        if path not in _keep:
            os.remove(path)
    print(f"Merged report: {output_file}")



def export_and_maybe_update_baseline(report, project_dir, config):
    """Export selected results and optionally refresh immutable measurements."""
    if config.update_baseline and (
        config.quick or config.mode != "all" or config.is_partial_formats or config.no_export or config.inference
    ):
        raise ValueError("Refusing to update baseline unless mode=all, full formats, export enabled, and no quick/inference")
    validate_single_report_dict(report)
    sha = resolve_git_commit(project_dir)
    if sha:
        report["metadata"].setdefault("gitCommit", sha)
    if config.effective_export:
        baseline.export_site_data(baseline.prune_report_for_site(report), os.path.join(project_dir, "site", "data"))
    if config.update_baseline:
        fresh = {"metadata": report["metadata"]}
        for key in ("loadingRuns", "queryRuns"):
            source = baseline.loading_runs(report) if key == "loadingRuns" else report.get(key, [])
            fresh[key] = [r for r in source if r.get("engine") in baseline.IMMUTABLE_ENGINES]
        if fresh["loadingRuns"]:
            merged = baseline.merge_reports(baseline.load_baseline(config.baseline), fresh,
                                            cached_engines=baseline.IMMUTABLE_ENGINES)
            baseline.save_baseline(merged, config.baseline)
