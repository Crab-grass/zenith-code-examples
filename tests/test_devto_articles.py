import io
import json
import os
import pathlib
import runpy
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stdout
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
NINTENDO = ROOT / "articles" / "devto" / "01-nintendo" / "nintendo.py"
SUBSIDIARIES = ROOT / "articles" / "devto" / "05-subsidiaries" / "subsidiaries.py"


def row(period, standard, revenue, operating_income):
    return {"fiscalPeriod": period, "accountingStandard": standard,
            "revenue": revenue, "operatingIncome": operating_income}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def run_script(rows, symbol):
    payload = json.dumps(rows).encode()
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp, \
            mock.patch.dict(os.environ, {"ZENITH_API_KEY": "test-key", "MPLBACKEND": "Agg"}), \
            mock.patch("urllib.request.urlopen", return_value=FakeResponse(payload)) as urlopen, \
            mock.patch("sys.argv", ["nintendo.py", symbol]), redirect_stdout(out):
        cwd = os.getcwd()
        os.chdir(tmp)
        try:
            runpy.run_path(str(NINTENDO), run_name="__main__")
            saved = (pathlib.Path(tmp) / f"{symbol}.png").exists()
        finally:
            os.chdir(cwd)
    return out.getvalue(), saved, urlopen.call_args[0][0]


# Fixtures are synthetic values, not company records.
class NintendoArticleTest(unittest.TestCase):
    def test_sorts_periods_and_keeps_missing_values(self):
        rows = [row("2026-03", "jgaap", 2_000_000_000_000, None),
                row("2025-03", "jgaap", 1_000_000_000_000, 200_000_000_000)]
        out, saved, request = run_script(rows, "7974")
        self.assertTrue(saved)
        self.assertIn("2025-03 to 2026-03", out)
        self.assertIn("symbol=7974", request.full_url)
        self.assertIn("period=annual", request.full_url)
        self.assertEqual(request.get_header("X-api-key"), "test-key")

    def test_notes_accounting_standard_change(self):
        rows = [row("2022-03", "ifrs", 900_000_000_000, 90_000_000_000),
                row("2021-03", "us-gaap", 800_000_000_000, 80_000_000_000)]
        out, saved, _ = run_script(rows, "6758")
        self.assertTrue(saved)
        self.assertIn("['ifrs', 'us-gaap']", out)

    def test_unknown_code_stops_without_chart(self):
        with self.assertRaises(SystemExit) as stop:
            run_script([], "9999")
        self.assertIn("No annual statements for 9999", str(stop.exception))


def filing(rows, other_counts=None, other_notes=None):
    return [{"counts": {"consolidated-subsidiary": rows}, "entities": [],
             "otherCounts": other_counts or [], "otherNotes": other_notes or []}]


def run_subsidiaries(by_symbol, *flags):
    """Run the article script with canned responses; symbols missing from by_symbol answer HTTP 404."""
    def fake_urlopen(req, *args, **kwargs):
        symbol = req.full_url.split("symbol=")[1]
        if symbol not in by_symbol:
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, io.BytesIO(b'{"error": "not_found"}'))
        return FakeResponse(json.dumps(by_symbol[symbol]).encode())

    out = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp, \
            mock.patch.dict(os.environ, {"ZENITH_API_KEY": "test-key", "MPLBACKEND": "Agg"}), \
            mock.patch("urllib.request.urlopen", side_effect=fake_urlopen) as urlopen, \
            mock.patch("time.sleep") as sleep, \
            mock.patch("sys.argv", ["subsidiaries.py", *flags]), redirect_stdout(out):
        cwd = os.getcwd()
        os.chdir(tmp)
        try:
            runpy.run_path(str(SUBSIDIARIES), run_name="__main__")
            saved = (pathlib.Path(tmp) / "subsidiaries_table_vs_other.png").exists()
        finally:
            os.chdir(cwd)
    return out.getvalue(), saved, urlopen.call_count, sleep.call_count


def other_count(category, count):
    return {"category": category, "count": count, "text": "synthetic"}


# Fixtures are synthetic values, not company records. Symbols follow the script's COMPANIES order:
# 6501, 7267, 6701, 6503, 7201, 6702, 2801, 7203, 7974.
class SubsidiariesArticleTest(unittest.TestCase):
    def test_other_counts_and_footnotes_are_read_without_turning_unknowns_into_zero(self):
        by_symbol = {
            "6501": filing(10, [other_count("consolidated-subsidiary", 100), other_count("equity-method-affiliate", 7)]),
            "7267": filing(5, [other_count("consolidated-subsidiary", 78), other_count("consolidated-subsidiary", 107)]),
            "6701": filing(3, other_notes=["上記のほか、233社の連結子会社があります。", "上記のほか、49社の持分法適用関連会社があります。"]),
            "6503": filing(4, other_notes=["（注）１．上記以外の連結子会社数は１，２０８社です", "２．上記以外の持分法適用関連会社数は10社です"]),
            "7201": filing(6),
            "6702": filing(7, [other_count("equity-method-affiliate", 19)]),
        }
        out, saved, calls, sleeps = run_subsidiaries(by_symbol)
        self.assertTrue(saved)
        self.assertIn("6501 (Hitachi): 10 table rows, other=100 (otherCounts)", out)
        self.assertIn("7267 (Honda): 5 table rows, other=185 (otherCounts)", out)
        self.assertIn("6701 (NEC): 3 table rows, other=233 (otherNotes)", out)
        self.assertIn("6503 (Mitsubishi Electric): 4 table rows, other=1208 (otherNotes)", out)
        self.assertIn("7201 (Nissan): 6 table rows, other=None (unknown)", out)
        self.assertIn("6702 (Fujitsu): 7 table rows, other=None (unknown)", out)
        self.assertEqual((calls, sleeps), (9, 8))

    def test_missing_symbols_are_skipped_not_charted_as_zero(self):
        out, saved, calls, _ = run_subsidiaries({"6501": filing(2, [other_count("consolidated-subsidiary", 3)])})
        self.assertTrue(saved)
        self.assertEqual(calls, 9)
        self.assertIn("7267 (Honda): no subsidiaries data for this symbol", out)
        self.assertEqual(out.count("no subsidiaries data"), 8)

    def test_ambiguous_values_are_marked_for_review(self):
        by_symbol = {
            "6501": filing(2, [other_count("consolidated-subsidiary", None)]),
            "7267": filing(2, other_notes=["上記のほか、連結子会社が3社、持分法適用関連会社が4社あります"]),
            "6701": filing(2, other_notes=["上記のほか、連結子会社が12社と5社あります"]),
        }
        out, _, _, _ = run_subsidiaries(by_symbol)
        self.assertIn("other=None (needs review)", out.splitlines()[0])
        self.assertIn("7267 (Honda): 2 table rows, other=None (needs review)", out)
        self.assertIn("6701 (NEC): 2 table rows, other=None (needs review)", out)

    def test_include_edge_cases_adds_two_symbols(self):
        out, _, calls, _ = run_subsidiaries({}, "--include-edge-cases")
        self.assertEqual(calls, 11)
        self.assertIn("9984 (SoftBank Group): no subsidiaries data", out)
        self.assertIn("8951 (404 example): no subsidiaries data", out)

    def test_filing_without_consolidated_count_is_not_charted(self):
        by_symbol = {"6501": [{"counts": {"equity-method-affiliate": 1}, "entities": [], "otherCounts": [], "otherNotes": []}]}
        out, saved, _, _ = run_subsidiaries(by_symbol)
        self.assertIn("6501 (Hitachi): None table rows, other=None (unknown)", out)
        self.assertTrue(saved)


if __name__ == "__main__":
    unittest.main()
