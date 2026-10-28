"""One-company report from demo data. No network, no extra packages."""
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import report  # noqa: E402
from zenith_examples import ZenithError, demo_requester  # noqa: E402


class ReportTests(unittest.TestCase):
    def test_english_report_has_every_section_and_sources(self):
        markdown, charts = report.build("DEMOA", "demo", demo_requester, "en", demo=True)
        for heading in ("Annual revenue", "Standalone quarters", "Financial health", "Position within the sector",
                        "Dividends", "Sources"):
            self.assertIn("## " + heading, markdown)
        self.assertIn("Demo data", markdown)
        self.assertIn("Not investment advice", markdown)
        self.assertIn("`DEMOA-2025-03`", markdown)
        self.assertEqual(sorted(charts), ["health.svg", "quarters.svg", "trend.svg"])
        for svg in charts.values():
            ET.fromstring(svg)

    def test_japanese_report_keeps_gaps(self):
        markdown, _ = report.build("DEMOC", "demo", demo_requester, "ja", demo=True)
        self.assertIn("業種：デモ食料品（架空）", markdown)
        self.assertIn("| 2025-12 | Q2 | 欠損 | 欠損 | missingValue |", markdown)
        self.assertIn("売上高（億円）", markdown)

    def test_failed_sections_are_reported_not_hidden(self):
        def requester(path, params, key):
            if path == "/industry-benchmarks":
                raise ZenithError("HTTP 429. Rate or quota limit reached.")
            return demo_requester(path, params, key)
        markdown, _ = report.build("DEMOA", "demo", requester, "en")
        self.assertNotIn("## Position within the sector", markdown)
        self.assertIn("Not available: `benchmark`: HTTP 429.", markdown)

    def test_cli_writes_files(self):
        with tempfile.TemporaryDirectory() as folder:
            argv = ["report.py", "--symbol", "DEMOB", "--demo", "--out", folder]
            with patch.object(sys, "argv", argv), patch("sys.stderr"):
                self.assertEqual(report.main(), 0)
            self.assertTrue((Path(folder) / "report.md").exists())
            self.assertTrue((Path(folder) / "trend.svg").exists())
            self.assertIn("No quarterly figures", (Path(folder) / "report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
