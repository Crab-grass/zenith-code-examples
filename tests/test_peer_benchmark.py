import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('peer_benchmark_server', ROOT / 'templates/peer-benchmark/server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

PRICE_FIELDS = ('price', 'marketCap', 'per', 'pbr', 'psr', 'evToEbitda', 'dividendYield', 'changePctYtd',
                'marketCapRank', 'marketCapRatio', 'perForecast', 'sectorCount')
EDINET = 'https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100TEST'


def provenance(source='edinet'):
    return {'source': source, 'docId': 'S100TEST', 'announcedAt': '2026-06-01T00:00:00Z',
            'sourceUrl': EDINET if source == 'edinet' else 'https://www.release.tdnet.info/inbs/x.pdf',
            'archiveUrl': 'https://api.zenithcode.net/stable/filing-document?docId=S100TEST&type=pdf',
            'fieldSources': {'revenue': 'x'}}


def fake_rows(path, params):
    symbol = params.get('symbol')
    meta = {'symbol': symbol, 'fiscalPeriod': '2026-03', 'period': 'FY', 'accountingStandard': 'ifrs',
            'fiscalPeriodDays': 365, 'updatedAt': '2026-10-01', 'provenance': provenance()}
    if path == '/peers':
        price = {'price': 1000, 'marketCap': 1e12, 'per': 10.0, 'pbr': 1.0, 'psr': 0.5, 'evToEbitda': 5.0,
                 'dividendYield': 0.03, 'changePctYtd': 0.1, 'marketCapRank': 1, 'marketCapRatio': 1,
                 'perForecast': 9.0, 'sectorCount': 80, 'roe': 0.1, 'roa': 0.04}
        return [dict(price, role='target', symbol=symbol, nameJa='テスト', nameEn='Test', sector='3700'),
                dict(price, role='peer', symbol='7267', nameJa='比較', nameEn='Peer', sector='3700'),
                dict(price, role='sector-median', symbol=None, nameJa=None, nameEn=None, sector='3700')]
    if path == '/industry-benchmarks':
        row = {'sector': params['sector'], 'sectorJa': '業種', 'sectorEn': 'Sector', 'count': 80}
        for metric in ('per', 'pbr', 'psr', 'evToEbitda', 'dividendYield', 'marketCap', 'roe', 'roa',
                       'revenueCagr3y', 'epsCagr3y'):
            row.update({metric + 'Count': 70, metric + 'Q1': 0.1, metric + 'Median': 0.2, metric + 'Q3': 0.3})
        return [row]
    if path == '/income-statement':
        return [dict(meta, revenue=1000, operatingIncome=100, netIncome=70, netIncomeAttributableToOwners=60,
                     operatingMargin=0.1, netMargin=0.06, eps=12.3, costOfRevenue=800)]
    if path == '/balance-sheet-statement':
        return [dict(meta, totalAssets=2000, ownersEquity=900, equityRatio=0.45, netInterestBearingDebt=-5,
                     provenance=provenance('tdnet'))]
    if path == '/cash-flow-statement':
        return [dict(meta, operatingCashFlow=120, capitalExpenditure=-40, freeCashFlow=80)]
    if path == '/segments':
        return [{'symbol': symbol, 'fiscalPeriod': '2026-03', 'period': 'FY', 'docId': 'S100TEST', 'unitMultiplier': 1000000,
                 'sourceUrl': EDINET, 'sourceTag': 'tag', 'items': [
                     {'segment': 'A', 'metric': 'net_sales_total', 'rawLabel': '外部', 'value': 10, 'periodEnd': '2026-03-31'},
                     {'segment': 'A', 'metric': 'segment_profit', 'rawLabel': '利益', 'value': 1}]}]
    if path == '/workforce':
        return [{'symbol': symbol, 'fiscalPeriod': '2026-03', 'period': 'FY', 'docId': 'S100TEST', 'employees': 10,
                 'consolidatedEmployees': 20, 'averageAge': 40.1, 'averageTenureYears': 12.0,
                 'averageAnnualSalary': 7000000, 'segments': [{'segment': 'x', 'employees': 1}], 'sourceUrl': EDINET}]
    if path == '/diversity':
        return [{'symbol': symbol, 'fiscalPeriod': '2026-03', 'period': 'FY', 'docId': 'S100TEST', 'sourceUrl': EDINET,
                 'reportingCompany': {'femaleManagerRatio': 0.05, 'maleChildcareLeaveRatio': 1.1,
                                      'maleChildcareLeaveBasis': 'childcare-leave', 'wageGapAll': 0.7, 'wageGapRegular': 0.7},
                 'subsidiaries': [{'name': 'Private subsidiary', 'femaleManagerRatio': 0.1}]}]
    raise AssertionError(path)


def keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from keys(v)


class PeerBenchmarkServerTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.fail_on = None
        self.release = None

        def requester(path, params, key):
            self.calls.append((path, dict(params), key))
            if self.release is not None:
                self.release.wait(5)
            if self.fail_on and self.fail_on == (path, params.get('symbol')):
                raise module.ZenithError('HTTP 403. private-upstream-body')
            return fake_rows(path, params)

        self.server = module.make_server(0, 'test-private-key', requester)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:%d' % self.server.server_port
        self.token = self.get('/api/config')[1]['requestToken']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def get(self, path, headers=None):
        return self.request(path, None, headers or {})

    def request(self, path, body, headers, raw=None):
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        r = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            response = urllib.request.urlopen(r, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = response.read()
            kind = response.headers.get('Content-Type', '')
            return response.status, json.loads(payload) if 'json' in kind else payload, response.headers

    def headers(self):
        return {'Content-Type': 'application/json', 'Origin': self.base, 'X-Local-Token': self.token}

    def compare(self, symbols, sector='3700'):
        return self.request('/api/compare', {'symbols': symbols, 'sector': sector}, self.headers())

    def test_static_and_demo_are_served_without_api_calls(self):
        for path in ['/', '/app.mjs', '/model.mjs', '/style.css', '/api/demo']:
            status, data, headers = self.get(path)
            self.assertEqual(status, 200)
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertIn("default-src 'self'", headers['Content-Security-Policy'])
            body = data if isinstance(data, bytes) else json.dumps(data).encode()
            self.assertNotIn(b'test-private-key', body)
        self.assertEqual(self.calls, [])

    def test_wrong_host_is_rejected(self):
        self.assertEqual(self.get('/', {'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request('/api/peers', {'symbol': '7203'}, {**self.headers(), 'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.calls, [])

    def test_missing_token_or_origin_is_rejected(self):
        for headers in [{'Content-Type': 'application/json', 'Origin': self.base},
                        {**self.headers(), 'X-Local-Token': 'wrong'},
                        {**self.headers(), 'Origin': 'https://example.com'},
                        {'Content-Type': 'application/json', 'X-Local-Token': self.token}]:
            self.assertEqual(self.request('/api/peers', {'symbol': '7203'}, headers)[0], 403)
            self.assertEqual(self.request('/api/compare', {'symbols': ['7203'], 'sector': None}, headers)[0], 403)
        self.assertEqual(self.calls, [])

    def test_bad_symbols_and_bodies_are_rejected_before_fetching(self):
        for value in ['https://example.com', '7203&key=x', '', 123, '72', 'DEMO-A', '7203.T.T', None]:
            self.assertEqual(self.request('/api/peers', {'symbol': value}, self.headers())[0], 400)
            self.assertEqual(self.compare([value])[0], 400)
        for body in [{'symbols': [], 'sector': None}, {'symbols': ['7203', '7203.T'], 'sector': None},
                     {'symbols': ['7203'], 'sector': '37'}, {'symbols': ['7203'], 'sector': 3700},
                     {'symbols': ['7203']}, {'symbols': ['7203'], 'sector': None, 'extra': 1},
                     {'symbols': '7203', 'sector': None}, ['7203']]:
            self.assertEqual(self.request('/api/compare', body, self.headers())[0], 400, body)
        self.assertEqual(self.request('/api/peers', {'symbol': '7203', 'limit': 50}, self.headers())[0], 400)
        self.assertEqual(self.request('/api/compare', None, self.headers(), raw=b'{' + b' ' * 600 + b'}')[0], 400)
        self.assertEqual(self.request('/api/compare', None, {**self.headers(), 'Content-Type': 'text/plain'},
                                      raw=b'{"symbols":["7203"],"sector":null}')[0], 400)
        self.assertEqual(self.get('/../demo.json')[0], 404)
        self.assertEqual(self.calls, [])

    def test_more_than_six_companies_is_rejected(self):
        status, data, _ = self.compare(['1301', '1332', '1333', '1375', '1376', '1377', '1379'])
        self.assertEqual((status, data), (400, {'error': 'invalid_request'}))
        self.assertEqual(self.calls, [])

    def test_peers_whitelist_strips_price_fields_and_median_row(self):
        status, data, _ = self.request('/api/peers', {'symbol': '7203'}, self.headers())
        self.assertEqual(status, 200)
        self.assertEqual(self.calls, [('/peers', {'symbol': '7203', 'limit': 5}, 'test-private-key')])
        self.assertEqual(data['target'], {'role': 'target', 'symbol': '7203', 'nameJa': 'テスト', 'nameEn': 'Test', 'sector': '3700'})
        self.assertEqual([p['symbol'] for p in data['peers']], ['7267'])
        found = set(keys(data))
        for field in PRICE_FIELDS + ('roe', 'roa'):
            self.assertNotIn(field, found)
        self.assertNotIn('test-private-key', json.dumps(data))

    def test_comparison_is_sequential_whitelisted_and_drops_archive_and_tdnet_links(self):
        status, data, _ = self.compare(['7203', '7267'])
        self.assertEqual(status, 200)
        paths = [c[0] for c in self.calls]
        per_company = ['/income-statement', '/balance-sheet-statement', '/cash-flow-statement', '/segments', '/workforce', '/diversity']
        self.assertEqual(paths, per_company * 2 + ['/industry-benchmarks'])
        self.assertEqual([c[1].get('symbol') for c in self.calls[:6]], ['7203'] * 6)
        self.assertEqual(self.calls[0][1], {'symbol': '7203', 'period': 'annual', 'limit': 4})
        self.assertEqual(self.calls[-1][1], {'sector': '3700'})
        found = set(keys(data))
        for field in PRICE_FIELDS + ('archiveUrl', 'fieldSources', 'subsidiaries', 'eps', 'costOfRevenue', 'sourceTag'):
            self.assertNotIn(field, found)
        bench = data['benchmark']
        self.assertEqual(bench['roeMedian'], 0.2)
        self.assertFalse(any(k.startswith(('per', 'pbr', 'psr', 'evToEbitda', 'dividendYield', 'marketCap')) for k in bench))
        company = data['companies'][0]
        self.assertEqual(company['income'][0]['provenance']['sourceUrl'], EDINET)
        self.assertIsNone(company['balance'][0]['provenance']['sourceUrl'])  # TDnet link never reaches the browser.
        self.assertEqual([i['metric'] for i in company['segments'][0]['items']], ['net_sales_total'])
        self.assertEqual(company['diversity'][0]['reportingCompany']['wageGapAll'], 0.7)
        self.assertNotIn('tdnet.info', json.dumps(data))

    def test_no_sector_means_no_benchmark_request(self):
        status, data, _ = self.compare(['7203'], None)
        self.assertEqual(status, 200)
        self.assertIsNone(data['benchmark'])
        self.assertEqual(len(self.calls), 6)

    def test_upstream_failure_aborts_without_exposing_upstream_text(self):
        self.fail_on = ('/segments', '7267')
        status, data, _ = self.compare(['7203', '7267', '6902'])
        self.assertEqual((status, data), (502, {'error': 'upstream_failed'}))
        self.assertEqual(len(self.calls), 6 + 4)  # Stops at the failing request; no retries.
        self.fail_on = ('/peers', '7203')
        status, data, _ = self.request('/api/peers', {'symbol': '7203'}, self.headers())
        self.assertEqual((status, data), (502, {'error': 'upstream_failed'}))

    def test_mismatched_rows_are_invalid_response(self):
        def wrong(path, params, key):
            rows = fake_rows(path, params)
            for row in rows:
                row['symbol'] = '9999'
            return rows
        server = module.make_server(0, 'k', wrong)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:%d' % server.server_port
        try:
            with urllib.request.urlopen(base + '/api/config') as r:
                token = json.load(r)['requestToken']
            request = urllib.request.Request(base + '/api/compare', data=b'{"symbols":["7203"],"sector":null}', headers={
                'Content-Type': 'application/json', 'Origin': base, 'X-Local-Token': token})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 502)
            self.assertEqual(json.load(error.exception), {'error': 'invalid_response'})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_concurrent_fetch_is_busy(self):
        self.release = threading.Event()
        first = threading.Thread(target=lambda: self.compare(['7203'], None))
        first.start()
        for _ in range(100):
            if self.calls:
                break
            threading.Event().wait(0.02)
        status, data, _ = self.request('/api/peers', {'symbol': '7267'}, self.headers())
        self.release.set()
        first.join(timeout=10)
        self.assertEqual((status, data), (429, {'error': 'busy'}))
        self.assertFalse(any(c[1].get('symbol') == '7267' for c in self.calls))

    def test_no_key_means_no_live_calls(self):
        server = module.make_server(0, requester=lambda *args: self.fail('unexpected live call'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:%d' % server.server_port
        try:
            with urllib.request.urlopen(base + '/api/config') as r:
                config = json.load(r)
            self.assertFalse(config['liveEnabled'])
            request = urllib.request.Request(base + '/api/peers', data=b'{"symbol":"7203"}', headers={
                'Content-Type': 'application/json', 'Origin': base, 'X-Local-Token': config['requestToken']})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


class PureFunctionTests(unittest.TestCase):
    def requester(self, calls, fail_on=None):
        def run(path, params, key):
            calls.append((path, params.get('symbol') or params.get('sector'), params.get('limit')))
            if fail_on == (path, params.get('symbol')):
                raise module.ZenithError('HTTP 500')
            return fake_rows(path, params)
        return run

    def test_fetch_bundle_is_the_browser_payload(self):
        calls = []
        bundle = module.fetch_bundle(['7203', '7267'], 'k', self.requester(calls), sector='3700')
        self.assertEqual(len(calls), 13)
        self.assertEqual(set(bundle), {'mode', 'retrievedAt', 'benchmark', 'companies'})
        self.assertEqual(json.loads(json.dumps(bundle, allow_nan=False)), bundle)
        for field in PRICE_FIELDS + ('archiveUrl',):
            self.assertNotIn(field, set(keys(bundle)))
        self.assertEqual(len(module.fetch_bundle(['7203'], 'k', self.requester([]))['companies']), 1)

    def test_build_snapshot_uses_the_same_shape_and_fetches_missing_names(self):
        spec = importlib.util.spec_from_file_location('peer_benchmark_build', ROOT / 'templates/peer-benchmark/build_demo.py')
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        calls = []
        snapshot = build.build_snapshot('7203', ['7267', '7269'], 'k', self.requester(calls))
        self.assertEqual(set(snapshot), {'peers', 'comparison'})
        self.assertEqual([p['symbol'] for p in snapshot['peers']['peers']], ['7267', '7269'])
        self.assertEqual(snapshot['peers']['peers'][1]['role'], 'peer')
        # 1 target suggestion + 1 name lookup (7269 was not suggested) + 6 x 3 companies + 1 benchmark.
        self.assertEqual(len(calls), 1 + 1 + 18 + 1)
        self.assertEqual(calls[1], ('/peers', '7269', 1))
        self.assertEqual([c['symbol'] for c in snapshot['comparison']['companies']], ['7203', '7267', '7269'])
        self.assertEqual(set(snapshot['comparison']), {'mode', 'retrievedAt', 'benchmark', 'companies'})
        for field in PRICE_FIELDS + ('archiveUrl',):
            self.assertNotIn(field, set(keys(snapshot)))
        with self.assertRaises(module.ZenithError):
            build.build_snapshot('7203', ['7267'], 'k', self.requester([], fail_on=('/workforce', '7267')))
        with self.assertRaises(ValueError):
            build._check({'a': [{'marketCap': 1}]})


if __name__ == '__main__':
    unittest.main()
