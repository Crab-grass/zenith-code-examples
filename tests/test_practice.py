"""Qiita practice 01-02 code with synthetic values only. No real API calls.

The rows use code 7203 only because the article code checks it; the amounts are invented.
"""
import csv
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

PRACTICE = Path(__file__).resolve().parents[1] / "practice"
sys.path.insert(0, str(PRACTICE))

try:
    import matplotlib  # noqa: F401
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


def synthetic_rows(**changes):
    rows = []
    for year, revenue, income in [(2021, 100, 8), (2022, 120, 9), (2023, 130, 7), (2024, 150, 15), (2025, 160, 12)]:
        rows.append({"symbol": "7203", "period": "FY", "accountingStandard": "ifrs",
                     "fiscalPeriod": "%d-03" % year, "revenue": revenue * 10**9,
                     "operatingIncome": income * 10**9, "operatingMargin": income / revenue,
                     "provenance": {"docId": "SYNTH%d" % year}})
    rows.append(dict(rows[-1], fiscalPeriod="2026-03"))  # outside the fixed five years
    for period, fields in changes.items():
        next(r for r in rows if r["fiscalPeriod"] == period).update(fields)
    return rows


class InFolder:
    def __enter__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        return Path(self.tmp.name)

    def __exit__(self, *exc):
        os.chdir(self.old)
        self.tmp.cleanup()


def save(rows):
    Path("toyota-income.json").write_text(json.dumps(
        {"retrievedAt": "2000-01-01T00:00:00+00:00", "url": "synthetic", "rows": rows}), encoding="utf-8")


class FetchTests(unittest.TestCase):
    def test_saves_rows_without_the_key(self):
        import practice01_fetch
        opener = Mock()
        opener.open.return_value = io.BytesIO(json.dumps(synthetic_rows()).encode())
        with InFolder() as folder, patch.object(practice01_fetch, "build_opener", return_value=opener), \
                patch.dict(os.environ, {"ZENITH_API_KEY": "test-only"}), redirect_stdout(io.StringIO()):
            practice01_fetch.main()
            saved = (folder / "toyota-income.json").read_text(encoding="utf-8")
        self.assertNotIn("test-only", saved)
        self.assertEqual(len(json.loads(saved)["rows"]), 6)
        self.assertEqual(opener.open.call_args.args[0].get_header("X-api-key"), "test-only")

    def test_rejects_non_list_response(self):
        import practice01_fetch
        opener = Mock()
        opener.open.return_value = io.BytesIO(b"{}")
        with InFolder() as folder, patch.object(practice01_fetch, "build_opener", return_value=opener), \
                patch.dict(os.environ, {"ZENITH_API_KEY": "test-only"}):
            with self.assertRaises(SystemExit):
                practice01_fetch.main()
            self.assertFalse((folder / "toyota-income.json").exists())


@unittest.skipUnless(HAS_MATPLOTLIB, "pip install -r practice/requirements.txt")
class PlotAndMarginTests(unittest.TestCase):
    def test_practice01_outputs_five_years_oldest_first(self):
        import practice01_plot
        with InFolder() as folder, redirect_stdout(io.StringIO()):
            save(synthetic_rows())
            practice01_plot.main()
            self.assertGreater((folder / "toyota-income.png").stat().st_size, 10_000)
            with (folder / "toyota-income.csv").open(encoding="utf-8-sig", newline="") as file:
                rows = list(csv.reader(file))
        self.assertEqual([r[0] for r in rows[1:]], ["2021-03", "2022-03", "2023-03", "2024-03", "2025-03"])
        self.assertEqual(rows[1][3], "SYNTH2021")

    def test_practice01_rejects_gaps_instead_of_filling_them(self):
        from practice01_plot import select_rows
        cases = [{"2023-03": {"revenue": None}}, {"2023-03": {"accountingStandard": "jgaap"}},
                 {"2023-03": {"fiscalPeriod": "2022-03"}}, {"2023-03": {"operatingIncome": float("nan")}}]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(ValueError):
                select_rows(synthetic_rows(**change))

    def test_practice02_keeps_missing_and_mismatch_visible(self):
        import practice02_margin
        rows = synthetic_rows(**{"2022-03": {"operatingMargin": None}, "2023-03": {"operatingMargin": 0.5}})
        with InFolder() as folder, redirect_stdout(io.StringIO()):
            save(rows)
            practice02_margin.main()
            self.assertGreater((folder / "toyota-margin.png").stat().st_size, 10_000)
            with (folder / "toyota-margin.csv").open(encoding="utf-8-sig", newline="") as file:
                result = list(csv.DictReader(file))
        self.assertEqual([r["apiCheck"] for r in result], ["match", "missing", "mismatch", "match", "match"])
        self.assertEqual(result[1]["apiRatio"], "")
        self.assertAlmostEqual(float(result[0]["calculatedPercent"]), 8.0)

    def test_practice02_stops_on_zero_revenue(self):
        from practice02_margin import calculate
        with self.assertRaises(ValueError):
            calculate(synthetic_rows(**{"2024-03": {"revenue": 0}}))


if __name__ == "__main__":
    unittest.main()
