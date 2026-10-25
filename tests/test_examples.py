"""Synthetic fixtures only. These tests never call the real API."""
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from zenith_examples import NoRedirect, ZenithError, request_rows, run_example


class ExampleTests(unittest.TestCase):
    def test_snapshot_preserves_dates_nulls_and_provenance(self):
        quote = [{"symbol": "DEMO", "priceDate": "2000-02-01", "price": 123}]
        statements = [{"symbol": "DEMO", "fiscalPeriod": "1999-12", "revenue": None,
                       "provenance": {"PL": {"source": "synthetic"}}}]
        requester = Mock(side_effect=[quote, statements])
        result = run_example("snapshot", "DEMO", "test-only", requester=requester)
        self.assertEqual(result["latestClose"], quote)
        self.assertEqual(result["annualFinancials"], statements)
        self.assertEqual(requester.call_args_list[1].args[1],
                         {"symbol": "DEMO", "period": "annual", "limit": 3})

    def test_empty_result_is_not_replaced(self):
        result = run_example("financials", "DEMO", "test-only", requester=Mock(return_value=[]))
        self.assertEqual(result["annualFinancials"], [])

    def test_full_uses_annual_period(self):
        requester = Mock(return_value=[])
        run_example("full", "DEMO", "test-only", requester=requester)
        requester.assert_called_once_with('/financial-statement-full', {"symbol": "DEMO", "quarter": "FY"}, 'test-only')

    def test_history_bounds(self):
        for start, end in [(None, None), ('2026-02-30', '2026-03-01'),
                           ('2026-03-02', '2026-03-01'), ('2024-01-01', '2026-01-01')]:
            with self.subTest(start=start, end=end):
                requester = Mock()
                with self.assertRaises(ZenithError):
                    run_example('history', 'DEMO', 'test-only', start, end, requester)
                requester.assert_not_called()

    def test_history_sends_requested_range(self):
        requester = Mock(return_value=[])
        run_example('history', '130A', 'test-only', '2026-09-01', '2026-09-30', requester)
        requester.assert_called_once_with('/historical-price-eod',
                                         {'symbol': '130A', 'from': '2026-09-01', 'to': '2026-09-30'}, 'test-only')

    def test_invalid_input_does_not_request(self):
        for mode, symbol in [('snapshot', '../key'), ('invalid', 'DEMO')]:
            requester = Mock()
            with self.assertRaises(ZenithError):
                run_example(mode, symbol, 'test-only', requester=requester)
            requester.assert_not_called()

    def test_key_only_in_header_and_timeout_is_bounded(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'[]')
        request_rows('/quote', {'symbol': 'DEMO'}, 'test-only', opener)
        req = opener.open.call_args.args[0]
        self.assertNotIn('test-only', req.full_url)
        self.assertEqual(req.get_header('X-api-key'), 'test-only')
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 30)

    def test_missing_key_does_not_request(self):
        opener = Mock()
        with self.assertRaises(ZenithError):
            request_rows('/quote', {}, '', opener)
        opener.open.assert_not_called()

    def test_http_error_has_no_body_leak_or_retry(self):
        for status in [401, 403, 404, 429, 500, 302]:
            opener = Mock()
            opener.open.side_effect = urllib.error.HTTPError(
                'https://example.invalid', status, 'synthetic-sensitive-text', {}, io.BytesIO(b'private-data'))
            with self.assertRaises(ZenithError) as raised:
                request_rows('/quote', {}, 'test-only', opener)
            self.assertNotIn('private-data', str(raised.exception))
            self.assertNotIn('synthetic-sensitive-text', str(raised.exception))
            self.assertIn(str(status), str(raised.exception))
            opener.open.assert_called_once()

    def test_invalid_response(self):
        for payload in [b'not json', b'{}', b'[1]', b'[null]']:
            opener = Mock()
            opener.open.return_value = io.BytesIO(payload)
            with self.assertRaises(ZenithError):
                request_rows('/quote', {}, 'test-only', opener)

    def test_network_errors_are_sanitized(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError('sensitive-text')
        with self.assertRaisesRegex(ZenithError, '^Network request failed or timed out.$'):
            request_rows('/quote', {}, 'test-only', opener)

    def test_redirect_is_refused(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.invalid'))


if __name__ == '__main__':
    unittest.main()
