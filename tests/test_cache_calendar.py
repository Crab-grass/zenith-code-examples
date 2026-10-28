"""--cache, earnings and dividends. Synthetic data only; no network."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import ZenithError, cache_key, cached, demo_requester, run_example, table_rows


class CacheTests(unittest.TestCase):
    def test_reuses_identical_requests_and_never_stores_the_key(self):
        requester = Mock(return_value=[{"v": 1}])
        stats = {}
        with tempfile.TemporaryDirectory() as folder:
            get = cached(requester, folder, 24, stats)
            self.assertEqual(get("/quote", {"symbol": "DEMO"}, "secret-key"), [{"v": 1}])
            self.assertEqual(get("/quote", {"symbol": "DEMO"}, "secret-key"), [{"v": 1}])
            get("/quote", {"symbol": "OTHER"}, "secret-key")
            saved = "".join(p.read_text(encoding="utf-8") for p in Path(folder).iterdir())
        self.assertEqual(requester.call_count, 2)
        self.assertEqual(stats, {"requested": 2, "reused": 1})
        self.assertNotIn("secret-key", saved)

    def test_expired_and_broken_files_are_refetched(self):
        requester = Mock(return_value=[])
        with tempfile.TemporaryDirectory() as folder:
            get = cached(requester, folder, 1)
            get("/quote", {"symbol": "DEMO"}, "k")
            file = Path(folder) / (cache_key("/quote", {"symbol": "DEMO"}) + ".json")
            data = json.loads(file.read_text(encoding="utf-8"))
            data["savedAt"] -= 7200
            file.write_text(json.dumps(data), encoding="utf-8")
            get("/quote", {"symbol": "DEMO"}, "k")
            file.write_text("{broken", encoding="utf-8")
            get("/quote", {"symbol": "DEMO"}, "k")
        self.assertEqual(requester.call_count, 3)

    def test_errors_are_not_cached(self):
        requester = Mock(side_effect=[ZenithError("HTTP 429."), []])
        with tempfile.TemporaryDirectory() as folder:
            get = cached(requester, folder)
            with self.assertRaises(ZenithError):
                get("/quote", {"symbol": "DEMO"}, "k")
            self.assertEqual(os.listdir(folder) if os.path.isdir(folder) else [], [])
            self.assertEqual(get("/quote", {"symbol": "DEMO"}, "k"), [])

    def test_key_matches_javascript(self):
        # Same value as cacheKey() in javascript/zenith-examples.mjs (see JS test).
        self.assertEqual(cache_key("/search-name", {"query": "トヨタ 自動車", "limit": 10}),
                         "337feba986e4f77b26dc8cff0edb4af38df5e0cf0b34c2402d5da8f7e5087900")


class EarningsDividendsTests(unittest.TestCase):
    def test_earnings_range_filter_and_bounds(self):
        requester = Mock(return_value=[{"symbol": "AAAA"}, {"symbol": "BBBB"}])
        result = run_example("earnings", "", "k", "2025-04-01", "2025-06-30", requester, symbols="BBBB")
        requester.assert_called_once_with("/earnings-calendar",
                                          {"limit": 200, "from": "2025-04-01", "to": "2025-06-30"}, "k")
        self.assertEqual(result["earnings"], [{"symbol": "BBBB"}])
        run_example("earnings", "", "k", requester=requester)
        self.assertEqual(requester.call_args.args[1], {"limit": 200})  # API defaults: today ±30 days
        for start, end in [("2025-01-01", "2025-12-31"), ("2025-04-01", None), ("2025-05-01", "2025-04-01")]:
            with self.assertRaises(ZenithError):
                run_example("earnings", "", "k", start, end, Mock())
        with self.assertRaises(ZenithError):
            run_example("earnings", "", "k", requester=Mock(), limit=501)

    def test_dividends_request_and_demo_rows(self):
        requester = Mock(return_value=[])
        run_example("dividends", "DEMO", "k", requester=requester)
        requester.assert_called_once_with("/dividends", {"symbol": "DEMO", "limit": 40}, "k")
        rows = run_example("dividends", "DEMOA", "demo", requester=demo_requester)["dividends"]
        self.assertEqual(rows[0]["forecastOrActual"], "forecast")
        self.assertEqual({r["dividendType"] for r in rows}, {"annual", "final", "interim"})
        fields, table = table_rows({"retrievedAt": "x", "dividends": rows})
        self.assertEqual(fields[0], "symbol")
        self.assertIsNone(table[0]["exDividendDate"])

    def test_demo_earnings_by_date(self):
        result = run_example("earnings", "", "demo", "2025-04-01", "2025-06-30", demo_requester)
        self.assertEqual([r["symbol"] for r in result["earnings"]], ["DEMOB", "DEMOA"])


class CliCacheTests(unittest.TestCase):
    def test_cli_reports_cache_use(self):
        import io
        import zenith_examples
        with tempfile.TemporaryDirectory() as folder:
            for expected in ("0 reused, 3 requested", "3 reused, 0 requested"):
                err = io.StringIO()
                argv = ["x", "statements", "--symbol", "DEMOA", "--demo", "--cache", folder]
                with patch.object(sys, "argv", argv), patch("sys.stderr", err), patch("sys.stdout", io.StringIO()):
                    self.assertEqual(zenith_examples.main(), 0)
                self.assertIn(expected, err.getvalue())


if __name__ == "__main__":
    unittest.main()
