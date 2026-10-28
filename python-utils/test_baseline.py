"""Unit tests for baseline management, engine planning, and report merging."""

import os
import tempfile
import unittest

from baseline import (
    classify_sparql,
    export_site_data,
    merge_reports,
    natural_query_key,
    plan_engines,
    save_baseline,
)


class TestBaseline(unittest.TestCase):

    def setUp(self):
        self.sample_baseline = {
            "metadata": {
                "version": "1.0",
                "generatedAt": "2026-10-28T00:00:00Z",
                "datasetQueries": {
                    "ds1": ["SELECT * WHERE { ?s ?p ?o }"]
                }
            },
            "runs": [
                {
                    "engine": "corese.4.6.5",
                    "dataset": "ds1",
                    "file": "data.nt",
                    "triples": 1000,
                    "loadingTimeMs": 100,
                    "throughputTriplesPerSec": 10000.0,
                    "memoryBeforeMb": 10.0,
                    "memoryAfterMb": 20.0,
                    "memoryDeltaMb": 10.0,
                    "cpuPercent": 5.0,
                    "repetitionsMs": [100]
                },
                {
                    "engine": "jena.6.2.0",
                    "dataset": "ds1",
                    "file": "data.nt",
                    "triples": 1000,
                    "loadingTimeMs": 50,
                    "throughputTriplesPerSec": 20000.0,
                    "memoryBeforeMb": 10.0,
                    "memoryAfterMb": 25.0,
                    "memoryDeltaMb": 15.0,
                    "cpuPercent": 8.0,
                    "repetitionsMs": [50]
                }
            ],
            "queryRuns": [
                {
                    "engine": "corese.4.6.5",
                    "dataset": "ds1",
                    "queryId": "query_1",
                    "queryCategory": "GRAPH_PATTERN",
                    "medianMs": 10,
                    "repetitionsMs": [10],
                    "medianTtfrMs": 10,
                    "repetitionsTtfrMs": [10],
                    "heapDeltaMb": 1.0
                },
                {
                    "engine": "corese.4.6.5",
                    "dataset": "ds1",
                    "queryId": "query_10",
                    "queryCategory": "GRAPH_PATTERN",
                    "medianMs": 20,
                    "repetitionsMs": [20],
                    "medianTtfrMs": 20,
                    "repetitionsTtfrMs": [20],
                    "heapDeltaMb": 2.0
                },
                {
                    "engine": "corese.4.6.5",
                    "dataset": "ds1",
                    "queryId": "query_2",
                    "queryCategory": "GRAPH_PATTERN",
                    "medianMs": 15,
                    "repetitionsMs": [15],
                    "medianTtfrMs": 15,
                    "repetitionsTtfrMs": [15],
                    "heapDeltaMb": 1.5
                }
            ]
        }

    def test_plan_engines_all_cached(self):
        plan = plan_engines(["corese.4.6.5", "jena.6.2.0"], ["ds1"], self.sample_baseline)
        self.assertEqual(plan.cached_engines, ["corese.4.6.5", "jena.6.2.0"])
        self.assertEqual(plan.fresh_engines, [])
        self.assertFalse(plan.has_fresh)

    def test_plan_engines_with_corese_next(self):
        plan = plan_engines(["corese.4.6.5", "corese.next"], ["ds1"], self.sample_baseline)
        self.assertEqual(plan.cached_engines, ["corese.4.6.5"])
        self.assertEqual(plan.fresh_engines, ["corese.next"])
        self.assertTrue(plan.has_fresh)

    def test_plan_engines_force_all(self):
        plan = plan_engines(["corese.4.6.5", "jena.6.2.0"], ["ds1"], self.sample_baseline, force_all=True)
        self.assertEqual(plan.cached_engines, [])
        self.assertEqual(plan.fresh_engines, ["corese.4.6.5", "jena.6.2.0"])

    def test_plan_engines_missing_dataset_triggers_fresh(self):
        plan = plan_engines(["corese.4.6.5"], ["ds1", "unknown_ds"], self.sample_baseline)
        self.assertEqual(plan.cached_engines, [])
        self.assertEqual(plan.fresh_engines, ["corese.4.6.5"])

    def test_natural_query_sorting(self):
        qids = ["query_10", "query_1", "query_2", "query_20"]
        sorted_qids = sorted(qids, key=natural_query_key)
        self.assertEqual(sorted_qids, ["query_1", "query_2", "query_10", "query_20"])

    def test_merge_reports(self):
        fresh = {
            "metadata": {"java": "Java 21"},
            "runs": [
                {
                    "engine": "corese.next",
                    "dataset": "ds1",
                    "file": "data.nt",
                    "triples": 1000,
                    "loadingTimeMs": 25,
                    "throughputTriplesPerSec": 40000.0,
                    "memoryBeforeMb": 5.0,
                    "memoryAfterMb": 10.0,
                    "memoryDeltaMb": 5.0,
                    "cpuPercent": 4.0,
                    "repetitionsMs": [25]
                }
            ],
            "queryRuns": [
                {
                    "engine": "corese.next",
                    "dataset": "ds1",
                    "queryId": "query_1",
                    "queryCategory": "GRAPH_PATTERN",
                    "medianMs": 5,
                    "repetitionsMs": [5],
                    "medianTtfrMs": 5,
                    "repetitionsTtfrMs": [5],
                    "heapDeltaMb": 0.5
                }
            ]
        }
        merged = merge_reports(self.sample_baseline, fresh, cached_engines=["corese.4.6.5", "jena.6.2.0"])
        engines_in_runs = {r["engine"] for r in merged["runs"]}
        self.assertEqual(engines_in_runs, {"corese.4.6.5", "jena.6.2.0", "corese.next"})
        self.assertEqual(merged["metadata"]["java"], "Java 21")
        # Ensure natural query sorting in queryRuns
        corese_qids = [q["queryId"] for q in merged["queryRuns"] if q["engine"] == "corese.4.6.5"]
        self.assertEqual(corese_qids, ["query_1", "query_2", "query_10"])

    def test_save_baseline_rejects_non_immutable(self):
        bad_baseline = {
            "runs": [{"engine": "corese.next", "dataset": "ds1"}],
            "queryRuns": []
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "baseline.json")
            with self.assertRaises(ValueError):
                save_baseline(bad_baseline, out_file)

    def test_save_and_load_baseline(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "baseline.json")
            save_baseline(self.sample_baseline, out_file)
            export_site_data(self.sample_baseline, tmpdir)
            self.assertTrue(os.path.exists(os.path.join(tmpdir, "benchmark-report.json")))
            self.assertTrue(os.path.exists(os.path.join(tmpdir, "report-data.js")))
            self.assertTrue(os.path.exists(os.path.join(tmpdir, "benchmark-report.csv")))

    def test_classify_sparql(self):
        self.assertEqual(classify_sparql("SELECT ?x WHERE { ?x ?p ?o }"), "GRAPH_PATTERN")
        self.assertEqual(classify_sparql("SELECT ?x WHERE { ?x ?p ?o } GROUP BY ?x"), "GROUP_BY")
        self.assertEqual(classify_sparql("SELECT ?x WHERE { ?x ?p ?o . FILTER(NOW() > ?d) }"), "TEMPORAL")
        self.assertEqual(classify_sparql("SELECT ?x WHERE { { SELECT ?x WHERE { ?x ?p ?o } } }"), "SUBQUERY")


if __name__ == "__main__":
    unittest.main()
