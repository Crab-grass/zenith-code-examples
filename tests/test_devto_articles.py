import io
import json
import os
import pathlib
import runpy
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
NINTENDO = ROOT / "articles" / "devto" / "01-nintendo" / "nintendo.py"


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


if __name__ == "__main__":
    unittest.main()
