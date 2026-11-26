"""Test query routing without running workflow.py's top-level builds/downloads."""
import ast
import os
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class WorkflowQueriesTest(unittest.TestCase):
    def setUp(self):
        project = Path(__file__).resolve().parents[2]
        source = ast.parse((project / "python-utils" / "workflow.py").read_text())
        selected = []
        for node in source.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id in ("SUPPORTED_DATASETS", "QUERIES_FILES")
                for target in node.targets
            ):
                selected.append(node)
            elif isinstance(node, ast.FunctionDef) and node.name == "run_benchmark":
                selected.append(node)
        self.namespace = dict(
            os=os, subprocess=subprocess, project_dir=str(project), gradle_wrapper="./gradlew",
            args=SimpleNamespace(inference=False, quick=False, query_timeout=None),
        )
        exec(compile(ast.Module(body=selected, type_ignores=[]), "workflow.py", "exec"), self.namespace)

    def test_every_dataset_uses_existing_v1_catalogue(self):
        mapping = self.namespace["QUERIES_FILES"]
        self.assertEqual(set(self.namespace["SUPPORTED_DATASETS"]), set(mapping))
        for catalogue in mapping.values():
            self.assertTrue(Path(catalogue).is_file())
            self.assertTrue(catalogue.endswith("input/queries/v1/catalogue.json"))

    def test_dataset_label_is_forwarded_for_java_filtering(self):
        for dataset in self.namespace["SUPPORTED_DATASETS"]:
            with self.subTest(dataset=dataset), patch.object(subprocess, "run") as run:
                self.namespace["run_benchmark"]("jena.6.2.0", "out.json", dataset, "/tmp/data")
                command = run.call_args.args[0]
                self.assertIn(f"{dataset} {self.namespace['QUERIES_FILES'][dataset]}", command[-1])
                self.assertEqual(self.namespace["project_dir"], run.call_args.kwargs["cwd"])
                self.assertEqual(run.call_args.kwargs["timeout"], 7200)

    def test_legacy_query_file_override_is_preserved(self):
        self.namespace["QUERIES_FILES"]["lubm"] = __file__
        with patch.object(subprocess, "run") as run:
            self.namespace["run_benchmark"]("jena", "out.json", "lubm", "/tmp/data")
            self.assertIn(__file__, run.call_args.args[0][-1])

    def test_validate_single_report_rejects_null_runs(self):
        project = Path(__file__).resolve().parents[2]
        source = ast.parse((project / "python-utils" / "workflow.py").read_text())
        names = {"_validate_run_list", "_validate_single_report_dict"}
        selected = [n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names]
        ns = {}
        exec(compile(ast.Module(body=selected, type_ignores=[]), "workflow.py", "exec"), ns)
        validate = ns["_validate_single_report_dict"]

        for key in ("runs", "loadingRuns", "queryRuns"):
            with self.subTest(key=key):
                report = {"metadata": {}, "runs": [{}], "queryRuns": [{}]}
                report[key] = None
                with self.assertRaises(RuntimeError) as ctx:
                    validate(report, "test.json")
                self.assertIn(f"non-list '{key}' field", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
