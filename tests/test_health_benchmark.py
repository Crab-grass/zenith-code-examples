"""health and benchmark. Synthetic data only; no network."""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import ZenithError, benchmark_rows, demo_requester, health_rows, run_example


def bs(period, assets, equity, api=None, **extra):
    return dict({"symbol": "DEMO", "fiscalPeriod": period, "totalAssets": assets, "ownersEquity": equity,
                 "equityRatio": equity / assets if api is None else api, "provenance": {"docId": "B" + period}}, **extra)


class HealthTests(unittest.TestCase):
    def test_ratios_checks_and_flags(self):
        rows = health_rows(
            [bs("2002-03", 100, 40, interestBearingDebt=20, totalCurrentAssets=30, totalCurrentLiabilities=20),
             bs("2001-03", 100, 50, api=0.6), bs("2003-03", 100, -5)],
            [{"fiscalPeriod": "2001-03", "operatingCashFlow": -3, "investingCashFlow": -2, "freeCashFlow": None},
             {"fiscalPeriod": "2002-03", "operatingCashFlow": 9, "investingCashFlow": -4, "freeCashFlow": 5,
              "provenance": {"docId": "C2002"}}])
        self.assertEqual([r["fiscalPeriod"] for r in rows], ["2001-03", "2002-03", "2003-03"])
        self.assertEqual(rows[0]["equityRatioCheck"], "mismatch")  # 0.5 recalculated vs 0.6 from the API
        self.assertEqual(rows[0]["freeCashFlow"], -5)  # derived only because the API value is missing
        self.assertEqual(rows[0]["flags"], "negativeOperatingCashFlow;negativeFreeCashFlow")
        self.assertEqual(rows[1]["equityRatioCheck"], "match")
        self.assertAlmostEqual(rows[1]["currentRatio"], 1.5)
        self.assertAlmostEqual(rows[1]["debtToEquity"], 0.5)
        self.assertEqual((rows[1]["balanceSheetDocId"], rows[1]["cashFlowDocId"]), ("B2002-03", "C2002"))
        self.assertEqual(rows[2]["flags"], "nonPositiveEquity;cashFlowMissing")
        self.assertAlmostEqual(rows[2]["equityRatio"], -0.05)  # negative equity is shown, not hidden
        self.assertIsNone(rows[2]["debtToEquity"])

    def test_requests(self):
        requester = Mock(return_value=[])
        run_example("health", "DEMO", "k", requester=requester, years=3)
        self.assertEqual([c.args[0] for c in requester.call_args_list], ["/balance-sheet-statement", "/cash-flow-statement"])
        with self.assertRaises(ZenithError):
            run_example("health", "DEMO", "k", requester=Mock(), years=0)


class BenchmarkTests(unittest.TestCase):
    BENCH = [{"sector": "ALL", "perQ1": 1, "perMedian": 2, "perQ3": 3},
             {"sector": "0001", "perQ1": 10, "perMedian": 14, "perQ3": 19, "perCount": 50,
              "roeQ1": 0.05, "roeMedian": 0.08, "roeQ3": 0.11}]

    def position(self, metric, value):
        profile = {"sector": "0001", "priceDate": "2000-01-01", "per": None, "pbr": None}
        key_metrics = {"fiscalPeriod": "2000-03"}
        (profile if metric in ("per", "pbr") else key_metrics)[metric] = value
        rows = benchmark_rows("DEMO", profile, key_metrics, {}, self.BENCH)
        return next(r for r in rows if r["metric"] == metric)

    def test_quartile_positions_use_the_company_sector(self):
        cases = [(9, "belowQ1"), (10, "Q1toMedian"), (14, "medianToQ3"), (19, "medianToQ3"), (20, "aboveQ3"),
                 (-3, "excludedLikeBenchmark"), (None, "noValue")]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(self.position("per", value)["position"], expected)
        self.assertEqual(self.position("per", 12)["sectorCount"], 50)
        self.assertEqual(self.position("roe", 1.5)["position"], "excludedLikeBenchmark")
        self.assertEqual(self.position("pbr", 1.0)["position"], "noBenchmark")
        self.assertEqual(self.position("roe", 0.09)["basis"], "fiscal period 2000-03")

    def test_requests_and_sector_required(self):
        calls = []

        def requester(path, params, key):
            calls.append(path)
            return {"/profile": [{"sector": "0001"}], "/industry-benchmarks": self.BENCH}.get(path, [])
        result = run_example("benchmark", "DEMO", "k", requester=requester)
        self.assertEqual(calls, ["/profile", "/key-metrics", "/key-metrics-latest", "/industry-benchmarks"])
        self.assertEqual(result["sector"], "0001")
        with self.assertRaises(ZenithError):
            run_example("benchmark", "DEMO", "k", requester=lambda *a: [{"sector": None}])

    def test_demo(self):
        result = run_example("benchmark", "DEMOA", "demo", requester=demo_requester)
        self.assertEqual(result["sectorName"], "Demo manufacturing (synthetic)")
        self.assertEqual(len(result["benchmark"]), 8)
        health = run_example("health", "DEMOC", "demo", requester=demo_requester)["health"]
        self.assertIn("negativeFreeCashFlow", health[2]["flags"])


if __name__ == "__main__":
    unittest.main()
