"""trend / compare / CSV with synthetic rows only. No real API calls."""
import csv
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import ZenithError, run_example, table_rows, write_csv


def row(code, period, revenue, income, api, standard="JGAAP", days=365):
    return {"symbol": code, "fiscalPeriod": period, "period": "FY", "accountingStandard": standard,
            "fiscalPeriodDays": days, "revenue": revenue, "operatingIncome": income,
            "operatingMargin": api, "provenance": {"source": "synthetic", "docId": "DEMO-" + period}}


class TrendTests(unittest.TestCase):
    def test_sorted_oldest_first_and_every_check_state(self):
        rows = [row("DEMO", "2003-03", 200, 30, 0.2),       # mismatch
                row("DEMO", "2001-03", 100, 10, 0.1),       # match
                row("DEMO", "2002-03", 100, 5, None),       # apiMissing
                row("DEMO", "2000-03", None, 1, None),      # notCalculated (missing revenue)
                row("DEMO", "2004-03", 0, 1, 0.1),          # notCalculated (zero revenue)
                row("DEMO", "2005-03", 100, -5, "x")]       # apiInvalid
        requester = Mock(return_value=rows)
        trend = run_example("trend", "DEMO", "test-only", requester=requester, years=6)["annualTrend"]
        requester.assert_called_once_with("/income-statement",
                                          {"symbol": "DEMO", "period": "annual", "limit": 6}, "test-only")
        self.assertEqual([r["fiscalPeriod"] for r in trend],
                         ["2000-03", "2001-03", "2002-03", "2003-03", "2004-03", "2005-03"])
        self.assertEqual([r["marginCheck"] for r in trend],
                         ["notCalculated", "match", "apiMissing", "mismatch", "notCalculated", "apiInvalid"])
        self.assertIsNone(trend[0]["revenue"])
        self.assertIsNone(trend[0]["calculatedMargin"])
        self.assertEqual(trend[3]["apiMargin"], 0.2)  # API value is kept, not overwritten
        self.assertAlmostEqual(trend[5]["calculatedMargin"], -0.05)
        self.assertEqual(trend[1]["docId"], "DEMO-2001-03")

    def test_years_bounds(self):
        for years in [0, 11, True, "5"]:
            requester = Mock()
            with self.assertRaises(ZenithError):
                run_example("trend", "DEMO", "test-only", requester=requester, years=years)
            requester.assert_not_called()


class CompareTests(unittest.TestCase):
    def test_common_periods_and_condition_notes(self):
        data = {"AAAA": [row("AAAA", "2001-03", 100, 10, 0.1, "IFRS"), row("AAAA", "2002-03", 100, 10, 0.1, "ifrs")],
                "BBBB": [row("BBBB", "2002-03", 50, None, None, "JGAAP", 300), row("BBBB", "2003-03", 50, 5, 0.1)]}
        requester = Mock(side_effect=lambda path, params, key: data[params["symbol"]])
        result = run_example("compare", "", "test-only", requester=requester, symbols="AAAA, BBBB")
        self.assertEqual(requester.call_count, 2)
        self.assertEqual(result["commonFiscalPeriods"], ["2002-03"])
        notes = " ".join(result["notes"])
        self.assertIn("accounting standards differ (IFRS, JGAAP)", notes)
        self.assertIn("period lengths differ (365/300 days)", notes)
        self.assertIn("could not be calculated", notes)

    def test_no_shared_period_is_reported(self):
        data = {"AAAA": [row("AAAA", "2002-03", 1, 1, 1.0)], "BBBB": [row("BBBB", "2001-12", 1, 1, 1.0)]}
        result = run_example("compare", "", "test-only", symbols="AAAA,BBBB",
                             requester=lambda path, params, key: data[params["symbol"]])
        self.assertEqual(result["commonFiscalPeriods"], [])
        self.assertIn("No fiscal period is shared", result["notes"][0])

    def test_invalid_symbol_lists_do_not_request(self):
        for symbols in [None, "AAAA", "AAAA,AAAA", "AAAA,BBBB,CCCC,DDDD,EEEE", "AAAA,../x"]:
            requester = Mock()
            with self.assertRaises(ZenithError):
                run_example("compare", "", "test-only", requester=requester, symbols=symbols)
            requester.assert_not_called()


class CsvTests(unittest.TestCase):
    def test_csv_keeps_missing_cells_empty_and_retrieved_at(self):
        result = run_example("trend", "DEMO", "test-only", years=2,
                             requester=lambda *a: [row("DEMO", "2001-03", None, 1, None), row("DEMO", "2002-03", 100, 10, 0.1)])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "out.csv"
            write_csv(path, *table_rows(result))
            self.assertTrue(path.read_bytes().startswith(b"\xef\xbb\xbf"))
            with path.open(encoding="utf-8-sig", newline="") as file:
                rows = list(csv.DictReader(file))
        self.assertEqual(rows[0]["revenue"], "")
        self.assertEqual(rows[0]["marginCheck"], "notCalculated")
        self.assertEqual(rows[1]["marginCheck"], "match")
        self.assertEqual(rows[1]["retrievedAt"], result["retrievedAt"])

    def test_csv_is_limited_to_table_modes(self):
        with self.assertRaises(ZenithError):
            table_rows({"symbol": "DEMO", "retrievedAt": "x", "annualFinancials": []})


if __name__ == "__main__":
    unittest.main()
