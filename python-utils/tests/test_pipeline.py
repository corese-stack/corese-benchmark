"""Regression tests for v1 caches and deterministic, sync_reports exports."""
import ast
import copy
import csv
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import baseline
import sync_reports


ENGINE = "jena.6.2.0"
EXPECTED = {"lubm": {"Q01", "Q04"}, "bsbm": {"Q02"}}


def report():
    loading = [{"engine": ENGINE, "dataset": ds, "file": "data.nt", "triples": 10,
                "loadingTimeMs": 5, "status": "SUCCESS", "errorMessage": ""} for ds in EXPECTED]
    queries = [{"engine": ENGINE, "dataset": ds, "queryId": qid, "status": "PASS", "medianMs": 1}
               for ds, ids in EXPECTED.items() for qid in sorted(ids)]
    return {"metadata": {}, "runs": loading, "loadingRuns": copy.deepcopy(loading), "queryRuns": queries}


def workflow_functions(*names, **namespace):
    source = ast.parse((Path(__file__).resolve().parents[1] / "workflow.py").read_text())
    nodes = {n.name: n for n in ast.walk(source) if isinstance(n, ast.FunctionDef)}
    exec(compile(ast.Module(body=[nodes[n] for n in names], type_ignores=[]), "workflow.py", "exec"), namespace)
    return namespace


class BaselineCoverageTest(unittest.TestCase):
    def test_catalogue_groups_only_curated_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalogue.json"
            path.write_text(json.dumps({"queries": [
                {"dataset": "lubm", "id": "Q01"}, {"dataset": "lubm", "id": "query_1"},
                {"dataset": "bsbm", "id": "Q02"},
            ]}))
            self.assertEqual(baseline.load_expected_v1_queries(path), {"lubm": {"Q01"}, "bsbm": {"Q02"}})

    def test_complete_coverage_for_every_dataset(self):
        data = report()
        def plan():
            return baseline.plan_engines([ENGINE], list(EXPECTED), data, expected_queries=EXPECTED)
        self.assertEqual(plan().cached_engines, [ENGINE])
        data["queryRuns"].pop()
        self.assertEqual(plan().fresh_engines, [ENGINE])
        data["queryRuns"] = [{"engine": ENGINE, "dataset": "lubm", "queryId": "query_1"}]
        self.assertEqual(plan().fresh_engines, [ENGINE])

    def test_other_engine_cannot_supply_coverage(self):
        data = report()
        data["queryRuns"][0]["engine"] = "corese.next"
        plan = baseline.plan_engines([ENGINE], list(EXPECTED), data, expected_queries=EXPECTED)
        self.assertEqual(plan.fresh_engines, [ENGINE])

    def test_current_immutable_variants_are_cached(self):
        for engine in baseline.IMMUTABLE_ENGINES:
            with self.subTest(engine=engine):
                data = report()
                for row in data["runs"] + data["queryRuns"]:
                    row["engine"] = engine
                plan = baseline.plan_engines([engine], list(EXPECTED), data, expected_queries=EXPECTED)
                self.assertEqual(plan.cached_engines, [engine])

    def test_failed_loading_is_not_cached(self):
        data = report()
        data["runs"][0]["status"] = "ERROR"
        plan = baseline.plan_engines([ENGINE], list(EXPECTED), data, expected_queries=EXPECTED)
        self.assertEqual(plan.fresh_engines, [ENGINE])

    def test_default_catalogue_rejects_legacy_for_real_dataset(self):
        data = report()
        data["queryRuns"] = [{"engine": ENGINE, "dataset": "lubm", "queryId": "query_1"}]
        self.assertEqual(baseline.plan_engines([ENGINE], ["lubm"], data).fresh_engines, [ENGINE])

    def test_export_synchronizes_loading_alias_and_query_rows(self):
        data = report()
        data["loadingRuns"] = []
        data["runs"][0].update(status="ERROR", errorMessage="bad, input\nretry")
        with tempfile.TemporaryDirectory() as directory:
            baseline.export_site_data(data, directory)
            saved = json.loads((Path(directory) / "benchmark-report.json").read_text())
            js = (Path(directory) / "report-data.js").read_text()
            self.assertEqual(json.loads(js.removeprefix("window.BENCHMARK_REPORT = ").removesuffix(";\n")), saved)
            self.assertEqual(saved["runs"], saved["loadingRuns"])
            self.assertEqual(saved["queryRuns"], data["queryRuns"])
            with open(Path(directory) / "benchmark-report.csv", newline="") as stream:
                rows = list(csv.reader(stream))
            divider = rows.index([])
            loads = [dict(zip(rows[0], row)) for row in rows[1:divider]]
            queries = [dict(zip(rows[divider + 1], row)) for row in rows[divider + 2:]]
            self.assertEqual(len(loads), len(saved["runs"]))
            self.assertEqual(loads[0]["status"], "ERROR")
            self.assertEqual(loads[0]["errorMessage"], "bad, input\nretry")
            self.assertEqual([q["queryId"] for q in queries], [q["queryId"] for q in saved["queryRuns"]])

    def test_save_rejects_mutable_query_engine(self):
        data = report()
        data["queryRuns"][0]["engine"] = "corese.next"
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                baseline.save_baseline(data, str(Path(directory) / "baseline.json"))


class WorkflowCacheTest(unittest.TestCase):
    def test_cache_requires_all_catalogue_ids_for_requested_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jena_6_2_0_lubm.json"
            ns = workflow_functions(
                "get_cached", "_validate_run_list", "_validate_single_report_dict",
                os=os, _json_early=json, cache_dir=directory, args=SimpleNamespace(benchmark_type="all"),
                expected_queries=EXPECTED, has_v1_query_coverage=baseline.has_v1_query_coverage,
                has_scale_loading_coverage=baseline.has_scale_loading_coverage, requested_scales=None,
                valid_loading_run=baseline.valid_loading_run, QUERIES_FILES={"lubm": "catalogue.json"},
            )
            data = report()
            for mode in ("all", "query"):
                ns["args"].benchmark_type = mode
                path.write_text(json.dumps(data))
                self.assertEqual(ns["get_cached"](ENGINE, "lubm"), str(path))
                for queries in ([], data["queryRuns"][:1], [
                    {"engine": ENGINE, "dataset": "lubm", "queryId": "query_1"},
                ]):
                    path.write_text(json.dumps({**data, "queryRuns": queries}))
                    self.assertIsNone(ns["get_cached"](ENGINE, "lubm"))
            ns["args"].benchmark_type = "load"
            self.assertEqual(ns["get_cached"](ENGINE, "lubm"), str(path))

    def test_checkpoints_survive_failed_output_validation(self):
        ns = workflow_functions(
            "merge_json_files", "_extract_report_entries", "_validate_run_list", "_validate_single_report_dict",
            os=os, _json_early=json, _finalize_merged_report=lambda *args: None,
        )
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "checkpoint.json"
            output = Path(directory) / "merged.json"
            checkpoint.write_text(json.dumps(report()))
            validate = ns["_validate_single_report_dict"]
            def reject_output(data, source_path=""):
                if str(source_path) == str(output):
                    raise RuntimeError("invalid persisted output")
                validate(data, source_path)
            ns["_validate_single_report_dict"] = reject_output
            with self.assertRaises(RuntimeError):
                ns["merge_json_files"]([str(checkpoint)], str(output))
            self.assertTrue(checkpoint.exists())
            ns["_validate_single_report_dict"] = validate
            ns["merge_json_files"]([str(checkpoint)], str(output))
            self.assertFalse(checkpoint.exists())
            self.assertEqual(json.loads(output.read_text())["runs"], report()["runs"])


class SyncReportsTest(unittest.TestCase):
    def test_deterministic_merge_filters_legacy_and_unknown_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            older, newer = report(), report()
            older["metadata"]["generatedAt"] = "2026-11-01T00:00:00Z"
            newer["metadata"]["generatedAt"] = "2026-11-02T00:00:00Z"
            newer["queryRuns"][0]["medianMs"] = 7
            newer["queryRuns"].extend({"engine": ENGINE, "dataset": "lubm", "queryId": qid}
                                      for qid in ("query_1", "Query", "Q999", "Q01junk"))
            (root / "z-old.json").write_text(json.dumps(older))
            (root / "a-new.json").write_text(json.dumps(newer))
            os.utime(root / "z-old.json", (2000000000, 2000000000))
            with patch.multiple(sync_reports, OUT_JSON_DIR=directory, TMP_RUNS_DIR=str(root / "tmp"),
                                NIGHT_RUNS_DIR=str(root / "night"), SITE_DATA_DIR=str(root / "export")), \
                 patch.object(sync_reports, "load_expected_v1_queries", return_value=EXPECTED):
                first = sync_reports.merge_all_data()
                os.utime(root / "a-new.json", (1, 1))
                second = sync_reports.merge_all_data()
            self.assertEqual(first, second)
            self.assertEqual(len(first["queryRuns"]), 3)
            self.assertEqual(next(q for q in first["queryRuns"] if q["queryId"] == "Q01")["medianMs"], 7)
            self.assertTrue((root / "export" / "benchmark-report.csv").exists())

    def test_promote_baseline_allows_documented_terminal_loading_failures(self):
        data = report()
        data["runs"].append({
            "engine": ENGINE, "dataset": "lubm", "file": "lubm_huge.nt",
            "status": "OOM", "triples": -1, "loadingTimeMs": -1, "errorMessage": "Heap limit",
        })
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "baseline.json"
            sync_reports.promote_baseline(data, EXPECTED, str(dest))
            saved = json.loads(dest.read_text())
            self.assertEqual(len(saved["runs"]), len(data["runs"]))
            self.assertEqual({r.get("status") for r in saved["runs"]}, {"SUCCESS", "OOM"})

    def test_timestamp_fallback_uses_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / name for name in ("z.json", "a.json")]
            for path in paths:
                path.write_text(json.dumps({"metadata": {}}))
            self.assertEqual(sorted(paths, key=sync_reports.report_sort_key), paths[::-1])

    def test_promote_requires_complete_pass_and_valid_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = str(Path(directory) / "baseline.json")
            data = report()
            sync_reports.promote_baseline(data, EXPECTED, destination)
            self.assertEqual(baseline.load_baseline(destination)["queryRuns"], data["queryRuns"])
            for field, value in (("status", "TIMEOUT"), ("queryId", "query_1")):
                bad = copy.deepcopy(data)
                bad["queryRuns"][0][field] = value
                with self.assertRaises(ValueError):
                    sync_reports.promote_baseline(bad, EXPECTED, destination)
            data["runs"][0]["loadingTimeMs"] = -1
            with self.assertRaises(ValueError):
                sync_reports.promote_baseline(data, EXPECTED, destination)

    def test_scale_aware_coverage_and_baseline_permissions(self):
        small_only = {
            "metadata": {},
            "runs": [{"engine": ENGINE, "dataset": "bsbm", "file": "bsbm_small.nt", "triples": 10, "loadingTimeMs": 5, "status": "SUCCESS"}],
            "queryRuns": [{"engine": ENGINE, "dataset": "bsbm", "queryId": "Q02", "status": "PASS", "medianMs": 1}],
        }
        self.assertEqual(
            baseline.plan_engines([ENGINE], ["bsbm"], small_only, expected_queries={"bsbm": {"Q02"}}, requested_scales=["small"]).cached_engines,
            [ENGINE],
        )
        self.assertEqual(
            baseline.plan_engines([ENGINE], ["bsbm"], small_only, expected_queries={"bsbm": {"Q02"}}, requested_scales=["small", "medium"]).fresh_engines,
            [ENGINE],
        )
        small_plus_oom = copy.deepcopy(small_only)
        small_plus_oom["runs"].append({
            "engine": ENGINE, "dataset": "bsbm", "file": "bsbm_medium.nt",
            "triples": -1, "loadingTimeMs": -1, "status": "OOM", "errorMessage": "Heap limit",
        })
        self.assertEqual(
            baseline.plan_engines([ENGINE], ["bsbm"], small_plus_oom, expected_queries={"bsbm": {"Q02"}}, requested_scales=["small", "medium"]).cached_engines,
            [ENGINE],
        )
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "baseline.json"
            sync_reports.promote_baseline(small_only, {"bsbm": {"Q02"}}, str(dest), required_scales=("small",))
            mode = os.stat(dest).st_mode
            self.assertTrue(bool(mode & 0o400))
            self.assertFalse(mode & 0o002)
            with self.assertRaises(ValueError):
                sync_reports.promote_baseline(small_only, {"bsbm": {"Q02"}}, str(dest), required_scales=("small", "medium"))


if __name__ == "__main__":
    unittest.main()
