"""search / statements / --demo. Synthetic data only; no network."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import DEMO_FILE, ZenithError, demo_requester, run_example


class SearchTests(unittest.TestCase):
    def test_search_sends_query_and_keeps_hits(self):
        hits = [{"symbol": "DEMOA", "nameEn": "Demo", "nameJa": "デモ"}]
        requester = Mock(return_value=hits)
        result = run_example("search", "", "test-only", requester=requester, query=" Toyota ")
        requester.assert_called_once_with("/search-name", {"query": "Toyota", "limit": 10}, "test-only")
        self.assertEqual(result["companies"], hits)

    def test_search_query_length(self):
        for query in [None, "", "a", "x" * 101]:
            requester = Mock()
            with self.assertRaises(ZenithError):
                run_example("search", "", "test-only", requester=requester, query=query)
            requester.assert_not_called()


class StatementsTests(unittest.TestCase):
    def test_three_statements_annual(self):
        requester = Mock(return_value=[])
        result = run_example("statements", "DEMO", "test-only", requester=requester, years=3)
        self.assertEqual([c.args[0] for c in requester.call_args_list],
                         ["/income-statement", "/balance-sheet-statement", "/cash-flow-statement"])
        for call in requester.call_args_list:
            self.assertEqual(call.args[1], {"symbol": "DEMO", "period": "annual", "limit": 3})
        self.assertEqual(result["balanceSheets"], [])

    def test_years_bounds(self):
        with self.assertRaises(ZenithError):
            run_example("statements", "DEMO", "test-only", requester=Mock(), years=0)


class DemoTests(unittest.TestCase):
    def test_demo_file_is_synthetic(self):
        data = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
        self.assertIn("Synthetic", data["_note"])
        symbols = {h["symbol"] for h in data["/search-name"]}
        self.assertTrue(all(s.startswith("DEMO") for s in symbols))
        for path in ("/income-statement", "/balance-sheet-statement", "/cash-flow-statement"):
            self.assertEqual(set(data[path]), symbols)
            for rows in data[path].values():
                self.assertTrue(all(r["provenance"]["source"] == "synthetic" for r in rows))

    def test_demo_answers_every_demo_mode(self):
        self.assertEqual(run_example("search", "", "demo", requester=demo_requester, query="MOTORS")["companies"][0]["symbol"], "DEMOA")
        self.assertEqual(len(run_example("search", "", "demo", requester=demo_requester, query="デモ")["companies"]), 3)
        trend = run_example("trend", "DEMOB", "demo", requester=demo_requester)["annualTrend"]
        self.assertIn("notCalculated", [r["marginCheck"] for r in trend])  # one revenue is deliberately null
        compared = run_example("compare", "", "demo", requester=demo_requester, symbols="DEMOA,DEMOC")
        self.assertEqual(compared["commonFiscalPeriods"], [])  # March versus December year ends
        statements = run_example("statements", "DEMOC", "demo", requester=demo_requester, years=2)
        self.assertEqual([r["fiscalPeriod"] for r in statements["cashFlows"]], ["2025-12", "2024-12"])
        self.assertEqual(run_example("trend", "ZZZZ", "demo", requester=demo_requester)["annualTrend"], [])

    def test_demo_refuses_endpoints_it_does_not_cover(self):
        with self.assertRaises(ZenithError):
            demo_requester("/quote", {"symbol": "DEMOA", "limit": 1})


if __name__ == "__main__":
    unittest.main()
