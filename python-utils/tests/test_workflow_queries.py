"""Query routing and report protocol tests."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workflow_cli import WorkflowConfig
import workflow_runner as runner
import workflow_reports as reports


class WorkflowQueriesTest(unittest.TestCase):
    def test_input_and_site_catalogues_are_identical(self):
        root = Path(__file__).resolve().parents[2]
        self.assertEqual((root / "input/queries/v1/catalogue.json").read_bytes(),
                         (root / "site/data/sparql/v1/catalogue.json").read_bytes())

    def test_every_dataset_uses_existing_v1_catalogue(self):
        self.assertEqual(set(runner.SUPPORTED_DATASETS), set(runner.QUERIES_FILES))
        for catalogue in runner.QUERIES_FILES.values():
            self.assertTrue(Path(catalogue).is_file())
            self.assertTrue(catalogue.endswith("input/queries/v1/catalogue.json"))

    def test_dataset_label_is_forwarded_for_java_filtering(self):
        for dataset in runner.SUPPORTED_DATASETS:
            with self.subTest(dataset=dataset), patch.object(runner.subprocess, "run") as run:
                runner.run_benchmark("/project", "./gradlew", ["jena.6.2.0"], "out.json", dataset,
                                     "/tmp/data", WorkflowConfig(("jena.6.2.0",)))
                self.assertIn(f"{dataset} {runner.QUERIES_FILES[dataset]}", run.call_args.args[0][-1])
                self.assertEqual(run.call_args.kwargs["timeout"], 7200)

    def test_validate_single_report_rejects_null_runs(self):
        for key in ("runs", "loadingRuns", "queryRuns"):
            with self.subTest(key=key):
                report = {"metadata": {}, "runs": [{}], "queryRuns": [{}], key: None}
                with self.assertRaisesRegex(RuntimeError, f"non-list '{key}' field"):
                    reports.validate_single_report_dict(report, "test.json")
