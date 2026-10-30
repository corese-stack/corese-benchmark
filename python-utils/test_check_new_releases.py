import http.client
import io
import json
import os
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

import check_new_releases as cnr


def fake_response(versions):
    body = json.dumps({"response": {"docs": [{"v": v} for v in versions]}}).encode()
    resp = mock.MagicMock()
    resp.read.return_value = body
    resp.__enter__.return_value = resp
    return resp


def fake_urlopen(jena, rdf4j):
    def _open(request, timeout=None):
        url = request.full_url if hasattr(request, "full_url") else request
        return fake_response(jena if "jena-arq" in url else rdf4j)

    return _open


class StabilityTests(unittest.TestCase):
    def test_rejects_unstable(self):
        for v in [
            "5.0.0-SNAPSHOT",
            "5.0.0-rc1",
            "5.0.0-RC2",
            "5.0.0-alpha1",
            "5.0.0-beta2",
            "5.0.0-M1",
            "5.0.0.M2",
            "4.0.0-milestone1",
        ]:
            self.assertFalse(cnr.is_stable(v), v)

    def test_accepts_stable(self):
        for v in ["5.0.0", "4.3.1", "5.1.0.Final", "3.7.7"]:
            self.assertTrue(cnr.is_stable(v), v)

    def test_latest_stable_numeric_order(self):
        self.assertEqual(cnr.latest_stable(["5.9.0", "5.10.0", "6.0.0-rc1"]), "5.10.0")
        self.assertIsNone(cnr.latest_stable(["1.0-SNAPSHOT"]))

    def test_version_key_normalization(self):
        self.assertEqual(cnr.version_key("5.0"), cnr.version_key("5.0.0"))
        self.assertTrue(cnr.version_key("5.0.1") > cnr.version_key("5.0"))


class FetchTests(unittest.TestCase):
    def test_fetch_versions(self):
        with mock.patch("urllib.request.urlopen", return_value=fake_response(["1.0", "2.0"])) as m:
            self.assertEqual(cnr.fetch_versions("g", "a"), ["1.0", "2.0"])
        self.assertIn("sort=timestamp+desc", m.call_args[0][0].full_url)

    def test_fetch_versions_retry_on_failure(self):
        err = urllib.error.URLError("temporary failure")
        good = fake_response(["2.0.0"])
        with mock.patch("urllib.request.urlopen", side_effect=[err, good]), \
             mock.patch("time.sleep"):
            versions = cnr.fetch_versions("g", "a", max_retries=2)
            self.assertEqual(versions, ["2.0.0"])


class BaselineTests(unittest.TestCase):
    def test_dict_formats(self):
        got = cnr.baseline_versions({"Jena": "5.0.0", "rdf4j": {"version": "4.3.1"}})
        self.assertEqual(got["jena"], {"5.0.0"})
        self.assertEqual(got["rdf4j"], {"4.3.1"})

    def test_list_of_strings_format(self):
        got = cnr.baseline_versions(["corese.4.6.5", "jena.6.2.0", "rdf4j.5.3.2"])
        self.assertEqual(got["jena"], {"6.2.0"})
        self.assertEqual(got["rdf4j"], {"5.3.2"})

    def test_list_format(self):
        got = cnr.baseline_versions(
            [{"name": "Apache Jena", "version": "5.0.0"}, {"name": "RDF4J", "version": "4.3.1"}]
        )
        self.assertEqual(got["jena"], {"5.0.0"})
        self.assertEqual(got["rdf4j"], {"4.3.1"})

    def test_empty(self):
        self.assertEqual(cnr.baseline_versions(None), {"jena": set(), "rdf4j": set()})


class MainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def baseline(self, engines):
        path = os.path.join(self.tmp.name, "baseline.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"metadata": {"engines": engines}}, fh)
        return path

    def run_main(self, args, jena, rdf4j):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen(jena, rdf4j)), \
                redirect_stdout(out), redirect_stderr(err):
            code = cnr.main(args)
        return code, out.getvalue(), err.getvalue()

    def test_up_to_date(self):
        path = self.baseline({"jena": "5.0.0", "rdf4j": "4.3.1"})
        code, out, _ = self.run_main(
            ["--baseline", path, "--check"], ["5.0.0", "5.1.0-SNAPSHOT"], ["4.3.1", "5.0.0-M1"]
        )
        self.assertEqual(code, 0)
        self.assertIn("up-to-date", out)

    def test_missing_with_check(self):
        path = self.baseline({"jena": "5.0.0", "rdf4j": "4.3.1"})
        code, out, _ = self.run_main(["--baseline", path, "--check"], ["5.0.0", "5.1.0"], ["4.3.1"])
        self.assertEqual(code, 1)
        self.assertIn("NEW", out)

    def test_missing_without_check_exits_zero(self):
        path = self.baseline({"jena": "5.0.0", "rdf4j": "4.3.1"})
        code, _, _ = self.run_main(["--baseline", path], ["5.1.0"], ["4.3.1"])
        self.assertEqual(code, 0)

    def test_json_output(self):
        path = self.baseline({"jena": "5.0.0", "rdf4j": "4.3.1"})
        code, out, _ = self.run_main(["--baseline", path, "--json"], ["5.1.0"], ["4.3.1"])
        data = json.loads(out)
        self.assertEqual(code, 0)
        self.assertEqual(data["missing"], ["jena"])
        self.assertEqual(data["engines"]["jena"]["latest"], "5.1.0")
        self.assertEqual(data["engines"]["jena"]["artifact"], "org.apache.jena:jena-arq")

    def test_verbose_logs_to_stderr(self):
        path = self.baseline({"jena": "5.0.0", "rdf4j": "4.3.1"})
        _, _, err = self.run_main(["--baseline", path, "--verbose"], ["5.0.0"], ["4.3.1"])
        self.assertIn("jena: 1 versions fetched", err)

    def test_engine_absent_from_baseline(self):
        path = self.baseline({"jena": "5.0.0"})
        code, _, _ = self.run_main(["--baseline", path, "--check"], ["5.0.0"], ["4.3.1"])
        self.assertEqual(code, 1)

    def test_network_error(self):
        path = self.baseline({"jena": "5.0.0"})
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")), \
                mock.patch("time.sleep"), \
                redirect_stderr(io.StringIO()):
            self.assertEqual(cnr.main(["--baseline", path]), 2)

    def test_missing_baseline_file(self):
        with redirect_stderr(io.StringIO()):
            self.assertEqual(cnr.main(["--baseline", "/nonexistent.json"]), 2)


if __name__ == "__main__":
    unittest.main()
