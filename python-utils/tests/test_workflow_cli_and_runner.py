"""Workflow argument and execution contracts."""
from __future__ import annotations

from contextlib import redirect_stderr
from dataclasses import FrozenInstanceError
import io
import json
from pathlib import Path
import re
import shlex
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import workflow
from workflow_cli import CANONICAL_FORMATS, WorkflowConfig, parse_args
import workflow_runner as runner
import workflow_reports as reports


class WorkflowCliTest(unittest.TestCase):
    def parse(self, *args):
        return parse_args(["--engines", "corese.local", *args])

    def rejects(self, args):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            parse_args(args)
        self.assertEqual(error.exception.code, 2)

    def test_required_and_removed_options(self):
        self.rejects([])
        for engine in ("", "corese.local,", "unknown.1", "corese"):
            self.rejects(["--engines", engine])
        for flag in ("--scales", "--resume", "--dataset", "--coreseVersions", "--coreseCommits", "--cached-engines",
                     "--force-all-engines", "--query-timeout", "--benchmark-type", "--dataDir", "--coreseLocalPath"):
            self.rejects(["--engines", "corese.local", flag])

    def test_formats(self):
        config = self.parse("--formats", ".ntriples,nquads,turtle,rdfxml,rdf/xml,json-ld,trig,nt")
        self.assertEqual(config.formats, tuple(sorted(CANONICAL_FORMATS)))
        self.assertFalse(config.is_partial_formats)
        self.assertEqual(config.effective_reuse, "baseline")
        self.assertTrue(config.effective_export)
        for formats in ("", "nt,", "unknown"):
            self.rejects(["--engines", "corese.local", "--formats", formats])
        with self.assertRaises(FrozenInstanceError):
            config.mode = "load"

    def test_baseline_guards(self):
        for flags in (["--quick"], ["--mode", "load"], ["--mode", "query"], ["--formats", "nt"],
                      ["--no-export"], ["--inference"]):
            self.rejects(["--engines", "corese.local", "--update-baseline", *flags])
        self.parse("--update-baseline", "--formats", ','.join(CANONICAL_FORMATS))
        for flag in ("--quick", "--inference"):
            cfg = self.parse(flag)
            self.assertEqual(cfg.effective_reuse, "none")
            self.assertFalse(cfg.effective_export)
        config = self.parse("--formats", "nt")
        self.assertEqual(config.effective_reuse, "none")
        self.assertFalse(config.effective_export)
        self.assertFalse(self.parse("--no-export").effective_export)

    def test_callers_use_supported_options(self):
        root = Path(__file__).resolve().parents[2]
        for path in (root / "Makefile", root / ".github/workflows/ci.yml"):
            flags = set(re.findall(r'--[a-zA-Z][\w-]*', path.read_text()))
            # Only inspect workflow flags; remaining flags belong to node, Gradle, curl and conda.
            external = {"--test", "--no-daemon", "--prune", "--shell", "--args", "--max-time", "--verbose"}
            workflow_flags = flags - external
            values = {"--engines": "corese.local", "--datasets": "dbpedia",
                      "--mode": "all", "--formats": "nt", "--reuse": "none", "--baseline": "base.json"}
            for flag in workflow_flags:
                args = [flag, values[flag]] if flag in values else [flag]
                if flag != "--engines":
                    args = ["--engines", "corese.local", *args]
                parse_args(args)

    def test_import_has_no_runtime_side_effects(self):
        import subprocess
        script = """
import os
import sys
from unittest.mock import patch
sys.path.insert(0, 'python-utils')
before = dict(os.environ)
with patch('subprocess.run', side_effect=AssertionError('unexpected subprocess')), patch('builtins.open', side_effect=AssertionError('unexpected file open')):
    import workflow
assert dict(os.environ) == before
"""
        subprocess.run([sys.executable, "-c", script], check=True,
                       cwd=Path(__file__).resolve().parents[2])

    def test_make_commands_parse(self):
        import subprocess
        root = Path(__file__).resolve().parents[2]
        for target in ("regression", "compare", "next", "versions", "corese-all", "quick", "bowlogna", "lubm", "bsbm", "all", "dev"):
            result = subprocess.run(["make", "-n", target, "FORMATS=nt", "MODE=load"],
                                    cwd=root, capture_output=True, text=True, check=True)
            command = shlex.split(result.stdout.strip())
            parse_args(command[2:])


class WorkflowRunnerTest(unittest.TestCase):
    def test_batches(self):
        engines = ["corese.4.6.5", "corese.4.6.4", "jena.6.2.0", "jena.6.1.0"]
        self.assertEqual(runner.plan_gradle_batches(engines),
                         [[engines[0], engines[2]], [engines[1], engines[3]]])
        self.assertEqual(runner.plan_gradle_batches(["corese.local", "corese.4.6.5"]),
                         [["corese.local"], ["corese.4.6.5"]])
        self.assertEqual(runner.gradle_props_for_batch(["corese.next", "jena.6.2.0.tdb2"]),
                         ["-PcoreseVersion=local", "-PjenaVersion=6.2.0"])
        self.assertEqual(len(runner.plan_gradle_batches(["jena.6.2.0", "jena.6.2.0.tdb2"])), 1)
        with self.assertRaises(ValueError):
            runner.gradle_props_for_batch(engines)

    def test_conversion(self):
        with patch.object(runner.subprocess, "run") as run:
            for mode, formats in (("query", None), ("load", ("nt",))):
                runner.convert_datasets_for_run("gradlew", "/p", {"lubm": "/data"}, mode, formats)
            run.assert_not_called()
            runner.convert_datasets_for_run("gradlew", "/p", {"lubm": "/data"}, "all", ("ttl",))
            self.assertEqual(run.call_args.args[0][-1], "--args=/data --formats=ttl")
            runner.convert_datasets_for_run("gradlew", "/p", {"lubm": "/data"}, "all", None)
            self.assertEqual(run.call_args.args[0][-1], "--args=/data")

    def test_conversion_filters_datasets_and_accepts_iterables(self):
        directories = {name: "/" + name for name in runner.SUPPORTED_DATASETS}
        with patch.object(runner.subprocess, "run") as run:
            runner.convert_datasets_for_run("gradlew", "/p", directories, "all", None)
            self.assertEqual({call.args[0][-1] for call in run.call_args_list},
                             {"--args=/" + name for name in runner.MULTI_FORMAT_DATASETS})
            run.reset_mock()
            runner.convert_datasets_for_run("gradlew", "/p", iter(["/legacy"]), "all", None)
            self.assertEqual(run.call_args.args[0][-1], "--args=/legacy")

    def test_run_flags(self):
        config = parse_args(["--engines", "jena.6.2.0", "--formats", "ttl", "--mode", "load", "--quick", "--inference"])
        with patch.object(runner.subprocess, "run") as run:
            runner.run_benchmark("/p", "gradlew", config.engines, "out.json", "lubm", "/data", config)
        args = shlex.split(run.call_args.args[0][-1].removeprefix("--args="))
        self.assertIn("--quick", args)
        self.assertIn("--inference", args)
        self.assertEqual(args[args.index("--mode") + 1], "load")
        self.assertEqual(args[args.index("--formats") + 1], "ttl")
        self.assertNotIn(runner.QUERIES_FILES["lubm"], args)

    def test_missing_report_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(runner, "resolve_paths", return_value=(Path(directory), Path(directory))), \
                 patch.object(runner, "prepare_datasets", return_value={"dbpedia": directory}), \
                 patch.object(runner, "sync_local_corese_jar"), patch.object(runner, "ensure_java_home"), \
                 patch.object(runner, "convert_datasets_for_run"), patch.object(runner, "gradle_build"), \
                 patch.object(runner, "run_benchmark"):
                with self.assertRaisesRegex(RuntimeError, "No fresh report"):
                    workflow.main(["--engines", "corese.local", "--reuse", "none", "--no-export"])

    def test_partial_run_does_not_export_or_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "json").mkdir()
            config = parse_args(["--engines", "corese.local", "--formats", "nt"])
            fresh = root / "fresh.json"
            fresh.write_text(json.dumps({"metadata": {}, "queryRuns": [{"status": "INCONCLUSIVE"}]}))
            with patch.object(workflow, "_run_fresh", return_value=[str(fresh)]), \
                 patch.object(workflow.baseline, "load_baseline") as load, \
                 patch.object(reports.baseline, "export_site_data") as export, \
                 patch.object(reports.baseline, "save_baseline") as save:
                workflow._execute(root, "gradlew", root, root, "run", config)
            load.assert_not_called()
            export.assert_not_called()
            save.assert_not_called()

    def test_tee_restores_streams_on_error(self):
        stdout, stderr = sys.stdout, sys.stderr
        with tempfile.TemporaryDirectory() as directory:
            log_file = Path(directory) / "run.log"
            holder = {}

            def fail_inside_tee():
                with workflow._tee_logs(log_file):
                    holder["stream"] = sys.stdout.log
                    print("recorded")
                    raise RuntimeError("failure")

            with self.assertRaisesRegex(RuntimeError, "failure"):
                fail_inside_tee()
            self.assertTrue(holder["stream"].closed)
            self.assertEqual((sys.stdout, sys.stderr), (stdout, stderr))
            self.assertIn("recorded", log_file.read_text())

    def test_merge_preserves_java_verdicts(self):
        with tempfile.TemporaryDirectory() as directory:
            b_src, f_src = Path(directory) / "baseline.json", Path(directory) / "fresh.json"
            dest = Path(directory) / "report.json"
            rows = [{"status": status, "resultHash": "untouched"} for status in ("PASS", "INCONCLUSIVE", "MISMATCH")]
            b_src.write_text(json.dumps({"metadata": {"gitCommit": "old", "environment": {"cpu": "old"}}, "runs": [{"id": 1}]}))
            f_src.write_text(json.dumps({"metadata": {"gitCommit": "new", "environment": {"cpu": "new"}}, "queryRuns": rows}))
            reports.merge_json_files([str(b_src), str(f_src)], str(dest))
            merged = json.loads(dest.read_text())
            self.assertEqual(merged["queryRuns"], rows)
            self.assertEqual(merged["metadata"]["gitCommit"], "new")
            self.assertEqual(merged["metadata"]["environment"], {"cpu": "new"})

    def test_sync_local_corese_jar_updates_stale_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            project = workspace / "corese-benchmark"
            checkout_libs = workspace / "corese-core" / "build" / "libs"
            project.mkdir()
            checkout_libs.mkdir(parents=True)
            staged = project / "libs" / "corese-core-local.jar"
            staged.parent.mkdir()
            staged.write_text("old")
            fresh = checkout_libs / "corese-core-next-jar-with-dependencies.jar"
            fresh.write_text("new-jar")
            runner.sync_local_corese_jar(project, ["corese.local"], None)
            self.assertEqual(staged.read_text(), "new-jar")

    def test_programmatic_update_baseline_guard_and_scale_slice(self):
        cfg = WorkflowConfig(engines=("jena.6.2.0",), mode="load", update_baseline=True)
        valid_report = {"metadata": {}, "runs": [{"engine": "jena.6.2.0", "dataset": "lubm", "file": "lubm_small.nt"}]}
        with self.assertRaises(ValueError):
            reports.export_and_maybe_update_baseline(valid_report, ".", cfg)
        data = {
            "metadata": {},
            "runs": [
                {"engine": "jena.6.2.0", "dataset": "lubm", "file": "lubm_small.nt"},
                {"engine": "jena.6.2.0", "dataset": "lubm", "file": "lubm_medium.nt"},
                {"engine": "jena.6.2.0", "dataset": "dbpedia", "file": "persondata_en.nt"},
            ],
            "queryRuns": [],
        }
        sliced = workflow._baseline_slice(data, ["jena.6.2.0"], ("lubm", "dbpedia"), "all")
        self.assertEqual([r["file"] for r in sliced["loadingRuns"]], ["lubm_small.nt", "lubm_medium.nt", "persondata_en.nt"])


class CanonicalWorkflowTest(unittest.TestCase):
    def test_canonical_cli_and_preparation(self):
        self.assertFalse(hasattr(parse_args(['--engines', 'jena.6.2.0']), 'scales'))
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parse_args(['--engines', 'jena.6.2.0', '--scales', 'canonical,small'])
        with patch.object(runner.importlib, 'import_module') as module:
            runner.prepare_datasets(['bowlogna', 'bsbm', 'lubm', 'dbpedia', 'named-graphs'], '/input')
        self.assertEqual([c.kwargs for c in module.return_value.prepare.call_args_list],
                         [{}, {}, {}, {}, {}])
