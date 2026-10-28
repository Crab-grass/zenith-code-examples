"""SVG charts from demo results. No network, no extra packages."""
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from chart_svg import render
from zenith_examples import demo_requester, run_example


class ChartTests(unittest.TestCase):
    def test_trend_chart_is_valid_svg_and_shows_gaps(self):
        trend = run_example("trend", "DEMOB", "demo", requester=demo_requester)
        trend["demo"] = True
        svg = render(trend)
        ET.fromstring(svg)  # well-formed XML
        self.assertIn("n/a", svg)  # the null revenue is a labelled gap, not a zero bar
        self.assertIn("Demo data", svg)
        self.assertIn("JGAAP", svg)
        self.assertIn("欠損", render(trend, "ja"))

    def test_compare_chart_uses_shared_periods_and_notes(self):
        compared = run_example("compare", "", "demo", requester=demo_requester, symbols="DEMOA,DEMOB")
        svg = render(compared)
        ET.fromstring(svg)
        self.assertIn("accounting standards differ", svg)
        self.assertNotIn("2021-03", svg)  # not shared by both companies' latest three years

    def test_compare_without_shared_period_is_refused(self):
        compared = run_example("compare", "", "demo", requester=demo_requester, symbols="DEMOA,DEMOC")
        with self.assertRaises(ValueError):
            render(compared)

    def test_text_is_escaped(self):
        svg = render({"symbol": "<x>&", "retrievedAt": "2000-01-01", "annualTrend": [
            {"fiscalPeriod": "2000-03", "accountingStandard": "jgaap", "revenue": 1, "calculatedMargin": 0.1}]})
        ET.fromstring(svg)
        self.assertIn("&lt;x&gt;&amp;", svg)

    def test_other_results_are_refused(self):
        with self.assertRaises(ValueError):
            render({"annualFinancials": []})


if __name__ == "__main__":
    unittest.main()


class MoreChartTests(unittest.TestCase):
    def test_quarters_and_health_charts(self):
        quarters = run_example("quarters", "DEMOC", "demo", requester=demo_requester, years=1)
        svg = render(quarters)
        ET.fromstring(svg)
        self.assertEqual(svg.count(">n/a<"), 4)  # Q2 and Q3 revenue and margin are gaps
        health = run_example("health", "DEMOC", "demo", requester=demo_requester)
        svg = render(health, "ja")
        ET.fromstring(svg)
        self.assertIn("自己資本比率", svg)
        self.assertIn(">-6<", svg)  # the negative free cash flow is drawn below zero
