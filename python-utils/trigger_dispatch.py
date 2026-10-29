#!/usr/bin/env python3
"""Helper script to trigger corese-benchmark via GitHub repository_dispatch.

Usage:
    python3 python-utils/trigger_dispatch.py --release-tag 4.6.6
    python3 python-utils/trigger_dispatch.py --corese-commit b8dbc158 --scales small
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trigger corese-benchmark via GitHub repository_dispatch.",
    )
    parser.add_argument(
        "--repo",
        default="corese-stack/corese-benchmark",
        help="Target repository (default: corese-stack/corese-benchmark)",
    )
    parser.add_argument(
        "--event-type",
        choices=["corese-release", "benchmark-trigger"],
        default="corese-release",
        help="Event type to dispatch (default: corese-release)",
    )
    parser.add_argument(
        "--release-tag",
        default="",
        help="Release tag of corese-core (e.g. 4.6.6 or v4.6.6)",
    )
    parser.add_argument(
        "--corese-commit",
        default="",
        help="Commit hash of corese-core to benchmark",
    )
    parser.add_argument(
        "--datasets",
        default="",
        help="Comma-separated datasets override (e.g. dbpedia,bowlogna)",
    )
    parser.add_argument(
        "--scales",
        default="",
        help="Comma-separated scale tiers (e.g. small,medium)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="GitHub personal access token (falls back to GITHUB_TOKEN or gh CLI)",
    )
    return parser.parse_args()


def dispatch_via_gh(
    repo: str,
    event_type: str,
    payload: dict[str, str],
) -> bool:
    """Attempt dispatch using GitHub CLI (gh)."""
    client_payload_json = json.dumps(payload)
    cmd = [
        "gh",
        "api",
        f"repos/{repo}/dispatches",
        "-X",
        "POST",
        "-F",
        f"event_type={event_type}",
        "-F",
        f"client_payload={client_payload_json}",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode == 0:
            print(f"[trigger] Dispatched '{event_type}' via gh CLI successfully.")
            return True
        print(f"[trigger] gh CLI error: {proc.stderr.strip()}", file=sys.stderr)
        return False
    except FileNotFoundError:
        return False


def dispatch_via_http(
    repo: str,
    event_type: str,
    payload: dict[str, str],
    token: str,
) -> bool:
    """Attempt dispatch using direct HTTP REST API."""
    if not token:
        print(
            "[trigger] Error: No GitHub token provided and gh CLI failed.",
            file=sys.stderr,
        )
        return False

    url = f"https://api.github.com/repos/{repo}/dispatches"
    body = json.dumps({"event_type": event_type, "client_payload": payload}).encode(
        "utf-8"
    )
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Corese-Benchmark-Trigger",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 204):
                print(f"[trigger] Dispatched '{event_type}' via HTTP API (HTTP {resp.status}).")
                return True
            print(f"[trigger] HTTP response status: {resp.status}", file=sys.stderr)
            return False
    except Exception as exc:
        print(f"[trigger] HTTP request failed: {exc}", file=sys.stderr)
        return False


def main() -> int:
    args = parse_args()
    payload: dict[str, str] = {}
    if args.release_tag:
        payload["release_tag"] = args.release_tag
    if args.corese_commit:
        payload["corese_commit"] = args.corese_commit
    if args.datasets:
        payload["datasets"] = args.datasets
    if args.scales:
        payload["scales"] = args.scales

    print(
        f"[trigger] Preparing dispatch for repo '{args.repo}', event: '{args.event_type}', payload: {payload}"
    )

    # 1. Try gh CLI first
    if dispatch_via_gh(args.repo, args.event_type, payload):
        return 0

    # 2. Fall back to direct HTTP
    if dispatch_via_http(args.repo, args.event_type, payload, args.token):
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
