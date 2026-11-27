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
XRAY = ROOT / "articles" / "devto" / "07-company-xray" / "company_xray.py"


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


def run_xray(by_key, *symbols, env=None):
    """Run company_xray.py with canned responses keyed by (endpoint, symbol); a missing key answers HTTP 404,
    a value that is an int answers that HTTP status."""
    def fake_urlopen(req, *args, **kwargs):
        url = req.full_url
        endpoint = url.split("/stable/")[1].split("?")[0]
        symbol = url.split("symbol=")[1].split("&")[0]
        body = by_key.get((endpoint, symbol))
        if body is None or isinstance(body, int):
            code = body or 404
            raise urllib.error.HTTPError(url, code, "error", {}, io.BytesIO(b'{"error": "x"}'))
        return FakeResponse(json.dumps(body).encode())

    out = io.StringIO()
    with mock.patch.dict(os.environ, env if env is not None else {"ZENITH_API_KEY": "test-key"}, clear=True), \
            mock.patch("urllib.request.urlopen", side_effect=fake_urlopen) as urlopen, \
            mock.patch("time.sleep") as sleep, \
            mock.patch("sys.argv", ["company_xray.py", *symbols]), redirect_stdout(out):
        runpy.run_path(str(XRAY), run_name="__main__")
    return out.getvalue(), urlopen.call_args_list, sleep.call_count


def xray_filing(symbol, employees=100, consolidated=1000, salary=5_000_000, **over):
    base = {"symbol": symbol, "fiscalPeriod": "2000-03", "docId": f"DOC{symbol}"}
    return {
        ("workforce", symbol): [{**base, "employees": employees, "consolidatedEmployees": consolidated,
                                 "averageAnnualSalary": salary}],
        ("diversity", symbol): [{**base, "reportingCompany": over.get("rc", {
            "femaleManagerRatio": 0.1, "maleChildcareLeaveRatio": 1.2, "maleChildcareLeaveBasis": "childcare-leave",
            "wageGapAll": 0.7}), "subsidiaries": [{}, {}]}],
        ("subsidiaries", symbol): [{**base, "counts": over.get("counts", {"consolidated-subsidiary": 3}),
                                    "otherCounts": over.get("other_counts", []), "otherNotes": over.get("other_notes", [])}],
        ("cross-shareholdings", symbol): over.get("cs", [{**base, "holders": [{"holder": "reporting", "companyName": None}],
                                                       "summary": [{"holder": "reporting", "purpose": "nonPureInvestment",
                                                                    "listing": "listed", "issues": 2, "carryingAmount": 999}]}]),
    }


# Fixtures are synthetic values, not company records.
class CompanyXrayArticleTest(unittest.TestCase):
    def test_one_block_with_all_four_sections_and_no_carrying_amounts(self):
        out, calls, sleeps = run_xray(xray_filing("1001", other_counts=[{"category": "consolidated-subsidiary", "count": 40}]), "1001")
        self.assertEqual(out.splitlines(), [
            "=== 1001 ===",
            "  Filing      : FY 2000-03 (docId DOC1001)",
            "  Workforce   : parent 100 / group 1,000 (10.0%) | avg salary 5,000,000 JPY",
            "  Diversity   : female mgr 10.0% | male leave 120.0% (childcare-leave) | pay gap all 70.0% | subs 2",
            "  Subsidiaries: table [consolidated-subsidiary=3] | otherCounts: consolidated-subsidiary+40",
            "  Holdings    : holders=1 (reporting) | issues: reporting/nonPureInvestment/listed=2",
        ])
        self.assertNotIn("999", out)
        self.assertEqual(len(calls), 4)
        self.assertEqual(sleeps, 0)
        request = calls[0][0][0]
        self.assertIn("symbol=1001&limit=1", request.full_url)
        self.assertEqual(request.get_header("X-api-key"), "test-key")

    def test_holding_company_null_basis_dynamic_counts_and_footnotes(self):
        cs = [{"holders": [{"holder": "reporting"}, {"holder": "largest", "companyName": "Fund A"}],
               "summary": [{"holder": "largest", "purpose": "pureInvestment", "listing": "unlisted", "issues": 7}]}]
        data = xray_filing("1002", employees=10, consolidated=1000, salary=None,
                           rc={"femaleManagerRatio": None, "maleChildcareLeaveBasis": None},
                           counts={"consolidated-subsidiary": 2, "affiliate": 1, "other": 1},
                           other_notes=["synthetic note"], cs=cs)
        out, _, _ = run_xray(data, "1002")
        self.assertIn("parent 10 / group 1,000 (1.0%) | avg salary — [parent only: 1.0% of group]", out)
        self.assertIn("female mgr — | male leave — (basis: —) | pay gap all —", out)
        self.assertIn("table [consolidated-subsidiary=2, affiliate=1, other=1] | otherNotes: 1 note(s)", out)
        self.assertIn("holders=2 (reporting, Fund A) | issues: largest/pureInvestment/unlisted=7", out)

    def test_403_and_404_are_reported_per_endpoint_and_the_run_continues(self):
        data = xray_filing("1003", cs=None)
        data[("cross-shareholdings", "1003")] = 403
        data[("subsidiaries", "1003")][0].update(otherCounts=[], otherNotes=[])
        out, calls, sleeps = run_xray(data, "1003", "9001")
        self.assertIn("  Holdings    : Business plan or higher required (HTTP 403)", out)
        self.assertIn("| other: not stated", out)
        self.assertEqual(out.splitlines()[-5:], [
            "=== 9001 ===",
            "  Workforce   : not_found",
            "  Diversity   : not_found",
            "  Subsidiaries: not_found",
            "  Holdings    : not_found",
        ])
        self.assertEqual((len(calls), sleeps), (8, 1))

    def test_missing_parent_or_group_headcount_gives_no_share(self):
        data = xray_filing("1004", employees=None, consolidated=0)
        data[("diversity", "1004")] = []
        out, _, _ = run_xray(data, "1004")
        self.assertIn("parent — / group 0 (—)", out)
        self.assertIn("  Diversity   : empty", out)

    def test_other_http_errors_stop_and_a_missing_key_stops_before_any_request(self):
        with self.assertRaises(urllib.error.HTTPError):
            run_xray({("workforce", "1005"): 429}, "1005")
        with self.assertRaises(SystemExit) as stop:
            run_xray({}, "1005", env={})
        self.assertIn("ZENITH_API_KEY", str(stop.exception))

    def test_default_symbol_is_7203(self):
        _, calls, _ = run_xray({})
        self.assertTrue(all("symbol=7203" in c[0][0].full_url for c in calls))


if __name__ == "__main__":
    unittest.main()
