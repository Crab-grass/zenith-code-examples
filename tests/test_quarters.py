"""Standalone quarters from Japanese year-to-date figures. Synthetic rows only."""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import ZenithError, demo_requester, run_example, standalone_quarters

DAYS = {"Q1": 91, "Q2": 182, "Q3": 273, "FY": 365}


def row(period, kind, revenue, income=10, net=5, standard="jgaap", days=None):
    return {"symbol": "DEMO", "fiscalPeriod": period, "period": kind, "accountingStandard": standard,
            "fiscalPeriodDays": DAYS[kind] if days is None else days, "revenue": revenue,
            "operatingIncome": income, "netIncome": net, "provenance": {"docId": period + kind}}


def year(**changes):
    rows = {"Q1": row("2025-06", "Q1", 100, 10, 5), "Q2": row("2025-09", "Q2", 210, 22, 11),
            "Q3": row("2025-12", "Q3", 330, 30, 15), "FY": row("2026-03", "FY", 460, 44, 20)}
    for kind, fields in changes.items():
        if fields is None:
            del rows[kind]
        else:
            rows[kind].update(fields)
    return list(rows.values())[::-1]  # newest first, as the API returns


class QuarterTests(unittest.TestCase):
    def test_differences_of_cumulative_values(self):
        result = standalone_quarters(year())
        self.assertEqual([r["quarter"] for r in result], ["Q1", "Q2", "Q3", "Q4"])
        self.assertEqual({r["fiscalYearEnd"] for r in result}, {"2026-03"})
        self.assertEqual([r["revenue"] for r in result], [100, 110, 120, 130])
        self.assertEqual([r["operatingIncome"] for r in result], [10, 12, 8, 14])
        self.assertEqual([r["cumulativeRevenue"] for r in result], [100, 210, 330, 460])
        self.assertAlmostEqual(result[3]["operatingMargin"], 14 / 130)
        self.assertEqual((result[3]["docId"], result[3]["previousDocId"]), ("2026-03FY", "2025-12Q3"))
        self.assertTrue(all(r["status"] == "ok" for r in result))

    def test_problems_leave_values_empty_with_a_reason(self):
        cases = [({"Q2": None}, "Q3", "missingPrevious"),
                 ({"FY": {"accountingStandard": "ifrs"}}, "Q4", "standardChanged"),
                 ({"FY": {"fiscalPeriodDays": 450}}, "Q4", "irregularPeriod"),
                 ({"Q2": {"revenue": None}}, "Q3", "missingValue")]
        for changes, quarter, status in cases:
            with self.subTest(status=status):
                found = next(r for r in standalone_quarters(year(**changes)) if r["quarter"] == quarter)
                self.assertEqual(found["status"], status)
                self.assertIsNone(found["revenue"])
                self.assertIsNotNone(found["cumulativeRevenue"])  # the reported figure is kept

    def test_december_year_end_and_separate_years(self):
        rows = [row("2024-12", "FY", 40), row("2024-09", "Q3", 30), row("2025-03", "Q1", 12)]
        result = standalone_quarters(rows)
        self.assertEqual([(r["fiscalYearEnd"], r["quarter"]) for r in result],
                         [("2024-12", "Q3"), ("2024-12", "Q4"), ("2025-12", "Q1")])
        self.assertEqual(result[0]["status"], "missingPrevious")
        self.assertEqual(result[1]["revenue"], 10)

    def test_request_and_demo(self):
        requester = Mock(return_value=[])
        run_example("quarters", "DEMO", "k", requester=requester, years=12 // 4)
        requester.assert_called_once_with("/income-statement", {"symbol": "DEMO", "limit": 12}, "k")
        with self.assertRaises(ZenithError):
            run_example("quarters", "DEMO", "k", requester=Mock(), years=11)
        demo = run_example("quarters", "DEMOC", "demo", requester=demo_requester, years=1)["quarters"]
        self.assertEqual([r["status"] for r in demo], ["ok", "missingValue", "missingValue", "ok"])


if __name__ == "__main__":
    unittest.main()
