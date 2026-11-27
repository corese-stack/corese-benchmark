"""LUBM generation uses the canonical ontology and scoped dataset views."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "benchmark_lubm", Path(__file__).resolve().parents[1] / "datasets" / "lubm.py")
lubm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lubm)


class LubmTest(unittest.TestCase):
    def test_prepare_passes_canonical_ontology_and_reuses_generated_scale(self):
        with tempfile.TemporaryDirectory() as directory:
            def generate(cmd, *, cwd, check):
                self.assertTrue(check)
                self.assertEqual(cmd[:4], ["java", "-cp", str(Path(directory) / "classes"),
                                          "edu.lehigh.swat.bench.uba.Generator"])
                self.assertEqual(cmd[cmd.index("-onto") + 1],
                                 "http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl")
                self.assertEqual(cmd[cmd.index("-univ") + 1], str(lubm.SCALES[Path(cwd).name.removeprefix("lubm_gen_")]))
                Path(cwd, "University0.owl").write_text("fixture")

            def convert(source, output):
                self.assertTrue(Path(source).is_file())
                output.write(b"<urn:s> <urn:p> <urn:o> .\n")

            with patch.object(lubm, "_download_uba", return_value=str(Path(directory) / "classes")), \
                 patch.object(lubm.subprocess, "run", side_effect=generate) as run, \
                 patch.object(lubm, "_owl_to_nt", side_effect=convert):
                view = Path(lubm.prepare(directory))
                self.assertEqual([p.name for p in view.iterdir()], ["lubm_medium.nt"])
                self.assertEqual((view / "lubm_medium.nt").read_bytes(), b"<urn:s> <urn:p> <urn:o> .\n")
                self.assertFalse(Path(directory, "_tools", "lubm_gen_small").exists())
                self.assertEqual(lubm.prepare(directory), str(view))
                self.assertEqual(run.call_count, 2)

    def test_prepare_regenerates_stale_ontology_iri_and_clears_siblings(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / "lubm" / "unzip"
            store.mkdir(parents=True)
            stale_nt = store / "lubm_small.nt"
            stale_ttl = store / "lubm_small.ttl"
            stale_nt.write_text("<urn:s> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://swat.cse.lehigh.edu/onto/univ-bench.owl#Student> .\n")
            stale_ttl.write_text("stale turtle")

            def generate(cmd, *, cwd, check):
                Path(cwd, "University0.owl").write_text("fixture")

            def convert(source, output):
                output.write(b"<urn:s> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#Student> .\n")  # NOSONAR

            with patch.object(lubm, "_download_uba", return_value=str(Path(directory) / "classes")), \
                 patch.object(lubm.subprocess, "run", side_effect=generate) as run, \
                 patch.object(lubm, "_owl_to_nt", side_effect=convert):
                lubm.prepare(directory)
                self.assertEqual(run.call_count, 2)
                self.assertFalse(stale_ttl.exists())
                self.assertIn("http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#Student", stale_nt.read_text())  # NOSONAR


if __name__ == "__main__":
    unittest.main()


class CanonicalDatasetViewsTest(unittest.TestCase):
    def test_named_graphs_materializes_before_removing_legacy_file(self):
        from datasets import named_graphs
        for legacy_symlink in (False, True):
            with self.subTest(legacy_symlink=legacy_symlink), tempfile.TemporaryDirectory() as directory:
                store = Path(directory) / "named-graphs" / "unzip"
                store.mkdir(parents=True)
                backing = Path(directory) / "backing.nq"
                backing.write_text("fixture quads")
                legacy = store / "named-graphs.nq"
                if legacy_symlink:
                    legacy.symlink_to(backing)
                else:
                    legacy.write_bytes(backing.read_bytes())
                target = store / "corese-feature-lubm.nq"
                target.symlink_to(legacy.name)
                with patch.object(named_graphs.subprocess, "run") as run:
                    named_graphs.prepare(directory)
                run.assert_not_called()
                self.assertFalse(target.is_symlink())
                self.assertEqual(target.read_text(), backing.read_text())
                self.assertFalse(legacy.exists())

    def test_scoped_views_and_catalogue_inputs(self):
        from datasets import bowlogna, bsbm, dbpedia, named_graphs
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for dataset, names in {
                'bowlogna': ['Department0.nt', 'Department1.nt'],
                'dbpedia': ['persondata_en.nt', 'homepages_en.nt'],
                'named-graphs': ['corese-feature-lubm.nq'],
            }.items():
                store = root / dataset / 'unzip'
                store.mkdir(parents=True)
                for name in names:
                    (store / name).write_text('fixture')
            view = Path(bowlogna.prepare(directory))
            self.assertEqual({p.name for p in view.iterdir()}, {'Department0.nt'})
            (view / 'Department0.ttl').write_text('stale')
            bowlogna.prepare(directory)
            self.assertEqual({p.name for p in view.iterdir()}, {'Department0.nt'})
            with patch.object(dbpedia.requests, 'get', side_effect=AssertionError('unexpected download')):
                view = Path(dbpedia.prepare(directory))
            self.assertEqual({p.name for p in view.iterdir()}, {'persondata_en.nt'})
            legacy = root / 'named-graphs/unzip/named-graphs.nq'
            legacy.symlink_to('corese-feature-lubm.nq')
            view = Path(named_graphs.prepare(directory))
            self.assertEqual({p.name for p in view.iterdir()}, {'corese-feature-lubm.nq'})
            for module, name, downloader, generator in (
                (bsbm, 'bsbm', '_download_generator', '_run_generator_for_scale'),
                (lubm, 'lubm', '_download_uba', '_generate_scale_nt'),
            ):
                def generate(*args):
                    Path(args[-1]).write_text('generated')
                with patch.object(module, downloader, return_value=directory), \
                     patch.object(module, generator, side_effect=generate) as run:
                    view = Path(module.prepare(directory))
                self.assertEqual(run.call_count, 2)
                self.assertTrue((root / name / 'unzip' / f'{name}_small.nt').is_file())
                self.assertEqual({p.name for p in view.iterdir()}, {f'{name}_medium.nt'})
