import copy
import importlib.util
import json
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "python" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reader = load("learn_tdnet")
chart = load("quarterly_chart")


class FactReadingTests(unittest.TestCase):
    def setUp(self):
        self.xml = reader.FIXTURE.read_text(encoding="utf-8")

    def test_amount_keeps_period_unit_precision_and_dimensions(self):
        fact = reader.read_fact(self.xml)
        self.assertEqual(fact["value"], "4500000000")
        self.assertEqual(fact["unit"], "JPY")
        self.assertEqual(fact["period"], {"start": "2025-04-01", "end": "2025-09-30"})
        self.assertEqual(fact["decimals"], "-6")
        self.assertEqual([d["member"][1] for d in fact["dimensions"]], ["ConsolidatedMember", "ResultMember"])

    def test_prefix_spelling_does_not_change_concept(self):
        self.assertEqual(reader.read_fact(self.xml.replace("tse-ed-t:", "tax:").replace("xmlns:tse-ed-t=", "xmlns:tax="))["value"], "4500000000")

    def test_nil_is_not_zero(self):
        self.assertIsNone(reader.read_fact(self.xml.replace('scale="6"', 'scale="6" xsi:nil="true"'))["value"])

    def test_sign_and_scale(self):
        self.assertEqual(reader.read_fact(self.xml.replace('scale="6"', 'scale="3" sign="-"'))["value"], "-4500000")

    def test_wrong_context_is_not_silently_selected(self):
        with self.assertRaises(ValueError):
            reader.read_fact(self.xml, "previous-year")

    def test_duplicate_fact_fails(self):
        start = self.xml.index('<ix:nonFraction ')
        end = self.xml.index('</ix:nonFraction>') + len('</ix:nonFraction>')
        with self.assertRaises(ValueError):
            reader.read_fact(self.xml.replace('</body>', self.xml[start:end] + '</body>'))

    def test_unsupported_values_and_missing_references_fail(self):
        replacements = [('iso4217:JPY', 'iso4217:USD'), ('ixt:numdotdecimal', 'ixt:unsupported'),
                        ('>4,500<', '>4,50<'), ('>4,500<', '>NaN<'),
                        ('unitRef="JPY"', 'unitRef="missing"'), ('scale="6"', 'scale="1000"'),
                        (reader.TAXONOMY, 'urn:unrelated')]
        for old, new in replacements:
            with self.subTest(old=old, new=new), self.assertRaises(ValueError):
                reader.read_fact(self.xml.replace(old, new))

    def test_dtd_and_namespace_rebinding_rejected(self):
        with self.assertRaises(ValueError):
            reader.read_fact(self.xml.replace('<html', '<!DOCTYPE html><html', 1))
        with self.assertRaises(ValueError):
            reader.read_fact(self.xml.replace('<body>', '<body xmlns:tse-ed-t="urn:other">'))


class QuarterlyTests(unittest.TestCase):
    def setUp(self):
        self.rows = json.loads(chart.FIXTURE.read_text(encoding="utf-8"))

    def test_expected_values_and_provenance(self):
        result = chart.standalone_quarters(self.rows)
        self.assertEqual([r['value'] for r in result], [Decimal('2000000000'), Decimal('2500000000'), Decimal('2700000000')])
        self.assertEqual(result[1]['sources'], ['synthetic-q2', 'synthetic-q1'])
        self.assertEqual(result[1]['start'], '2025-07-01')

    def test_revision_changes_derived_quarter(self):
        self.rows[0]['value'] = '2100000000'
        self.assertEqual(chart.standalone_quarters(self.rows)[1]['value'], Decimal('2400000000'))

    def test_incomparable_and_missing_inputs_rejected(self):
        for key, value in [('kind', 'forecast'), ('unit', 'USD'), ('scope', 'nonconsolidated'),
                           ('start', '2025-07-01'), ('end', '2025-12-31'), ('company', 'OTHER'),
                           ('accounting', 'IFRS'), ('concept', 'EPS'), ('source', ''),
                           ('value', None), ('value', 'NaN'), ('value', 'Infinity')]:
            rows = copy.deepcopy(self.rows)
            rows[1][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                chart.standalone_quarters(rows)
        with self.assertRaises(ValueError):
            chart.standalone_quarters(self.rows[:2])

    def test_chart_preview_is_reproducible_and_labels_missing_q4(self):
        svg = chart.chart_svg(chart.standalone_quarters(self.rows))
        self.assertIn('Synthetic data', svg)
        self.assertIn('Q4 unavailable', svg)
        self.assertEqual(svg, (ROOT / 'assets' / 'quarterly-sales.svg').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
