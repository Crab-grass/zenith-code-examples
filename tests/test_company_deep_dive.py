import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates/company-deep-dive"


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, TEMPLATE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load("deep_dive_server", "server.py")
build_demo = load("deep_dive_build_demo", "build_demo.py")

EDINET = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100ABCD"
ARCHIVE = "https://api.zenithcode.net/stable/filing-document?docId=S100ABCD&type=pdf"
TDNET_ID = "140120260101000001"
PRICE_FIELDS = ("price", "marketCap", "per", "pbr", "psr", "dividendYield", "perForecast", "psrForecast",
                "pegRatioForecast", "revenueGrowthVsActual")


def statement(fp, source="edinet", **values):
    row = {"symbol": "7203", "fiscalPeriod": fp, "period": "FY", "accountingStandard": "IFRS", "updatedAt": "2026-06-01T00:00:00Z",
           "fiscalPeriodDays": 365, "price": 2500, "marketCap": 1e13, "per": 9.1, "pbr": 1.1, "eps": 100.0,
           "provenance": {"source": source, "docId": "S100ABCD" if source == "edinet" else TDNET_ID, "announcedAt": "2026-06-01T00:00:00Z",
                          "sourceUrl": EDINET if source == "edinet" else "https://www.release.tdnet.info/inbs/x.pdf",
                          "archiveUrl": ARCHIVE, "fieldSources": {"revenue": "x"}}}
    row.update(values)
    return row


class FakeApi:
    """Answers like the API, including fields the server must strip."""

    def __init__(self, fail_on=None, segments=True, income_periods=("2026-03", "2025-03")):
        self.calls, self.fail_on, self.segments, self.income_periods = [], fail_on, segments, income_periods

    def __call__(self, path, params, key):
        self.calls.append((path, dict(params), key))
        if self.fail_on == len(self.calls):
            raise server.ZenithError("HTTP 401. private-upstream-detail")
        if path == "/income-statement":
            return [statement(fp, revenue=1000, operatingIncome=100, netIncome=60) for fp in self.income_periods]
        if path == "/balance-sheet-statement":
            return [statement("2026-03", source="tdnet", equityRatio=0.4, netInterestBearingDebt=10, priceToBook=1.2)]
        if path == "/cash-flow-statement":
            return [statement("2026-03", operatingCashFlow=50, capitalExpenditure=-20, nested={"a": 1}, freeCashFlow=[1])]
        if path == "/segments":
            if not self.segments:
                return []
            fp = params.get("fiscalPeriod", self.income_periods[0])
            return [{"symbol": "7203", "fiscalPeriod": fp, "period": "FY", "docId": "S100ABCD", "docTypeCode": "120",
                     "submittedAt": "2026-06-10 06:33:00", "sourceTag": "x", "unitMultiplier": 1000000, "note": None,
                     "sourceUrl": EDINET, "archiveUrl": ARCHIVE,
                     "items": [{"segment": "A", "metric": "net_sales_total", "rawLabel": "r", "value": 5, "periodEnd": None, "price": 1}]}]
        if path == "/earnings-forecast":
            base = {"symbol": "7203", "forecastFiscalPeriod": None, "accountingStandard": "ifrs", "revenueForecast": 1,
                    "operatingIncomeForecast": 2, "netIncomeForecast": 3, "epsForecast": 4.0, "perForecast": 8.0,
                    "psrForecast": 0.9, "pegRatioForecast": 1.5, "roeForecast": 0.1, "roaForecast": 0.05,
                    "revenueGrowthVsActual": 0.1, "archiveUrl": ARCHIVE}
            return [dict(base, fiscalPeriod="2026-06", period="Q1", forecastTarget="current-fiscal-year", announcedAt="2026-08-04T05:00:00Z",
                         source="tdnet", docId=TDNET_ID, sourceUrl="https://www.release.tdnet.info/inbs/x.pdf"),
                    dict(base, fiscalPeriod="2026-03", period="FY", forecastTarget="next-fiscal-year", forecastFiscalPeriod="2027-03",
                         announcedAt="2026-06-10T06:33:00Z", source="edinet", docId="S100ABCD", sourceUrl=EDINET)]
        if path == "/workforce":
            return [{"symbol": "7203", "fiscalPeriod": "2026-03", "period": "FY", "docId": "S100ABCD", "employees": 10,
                     "segments": [{"segment": "A", "employees": 7, "extra": "x"}], "parentSegments": "bad", "sourceUrl": EDINET}]
        if path == "/diversity":
            return [{"symbol": "7203", "fiscalPeriod": "2026-03", "period": "FY", "docId": "S100ABCD", "sourceUrl": "https://example.com/x",
                     "reportingCompany": {"femaleManagerRatio": 0.1, "wageGapAll": 0.7, "price": 1},
                     "subsidiaries": [{"name": "S", "femaleManagerRatio": 0.2}]}]
        raise AssertionError("unexpected path " + path)


def keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from keys(v)


class FetchBundleTests(unittest.TestCase):
    def test_request_order_count_and_previous_segment_period(self):
        api = FakeApi()
        bundle = server.fetch_bundle("7203", "k", api)
        self.assertEqual([(p, q) for p, q, _ in api.calls], [
            ("/income-statement", {"symbol": "7203", "period": "annual", "limit": 5}),
            ("/balance-sheet-statement", {"symbol": "7203", "period": "annual", "limit": 5}),
            ("/cash-flow-statement", {"symbol": "7203", "period": "annual", "limit": 5}),
            ("/segments", {"symbol": "7203"}),
            ("/segments", {"symbol": "7203", "fiscalPeriod": "2025-03"}),
            ("/earnings-forecast", {"symbol": "7203", "limit": 20}),
            ("/workforce", {"symbol": "7203"}),
            ("/diversity", {"symbol": "7203"}),
        ])
        self.assertEqual(bundle["segments"]["previousRequested"], "2025-03")
        self.assertEqual(bundle["segments"]["previous"]["fiscalPeriod"], "2025-03")

    def test_previous_period_follows_fiscal_year_end_changes(self):
        # A change from March to December: the previous annual period is the 2025-03 transition year.
        api = FakeApi(income_periods=("2025-12", "2025-03", "2024-03"))
        server.fetch_bundle("7203", "k", api)
        self.assertEqual(api.calls[4][1]["fiscalPeriod"], "2025-03")
        self.assertEqual(server.previous_fiscal_period("2026-08", []), "2025-08")
        self.assertEqual(server.previous_fiscal_period("2026-01", [{"fiscalPeriod": "bad"}]), "2025-01")

    def test_no_segment_report_means_seven_requests(self):
        api = FakeApi(segments=False)
        bundle = server.fetch_bundle("7203", "k", api)
        self.assertEqual(len(api.calls), 7)
        self.assertEqual(bundle["segments"], {"current": None, "previous": None, "previousRequested": None})

    def test_whitelist_strips_prices_and_tdnet_links(self):
        bundle = server.fetch_bundle("7203", "k", FakeApi())
        found = set(keys(bundle))
        for field in PRICE_FIELDS + ("archiveUrl", "fieldSources", "sourceTag", "eps", "priceToBook", "roaForecast", "extra", "nested"):
            self.assertNotIn(field, found)
        text = json.dumps(bundle)
        for needle in ("tdnet.info", "filing-document", TDNET_ID, "example.com"):
            self.assertNotIn(needle, text)
        tdnet, edinet = bundle["forecasts"]
        self.assertEqual((tdnet["source"], tdnet["docId"], tdnet["sourceUrl"]), ("tdnet", None, None))
        self.assertEqual((edinet["docId"], edinet["sourceUrl"]), ("S100ABCD", EDINET))
        self.assertEqual(bundle["balanceSheets"][0]["provenance"], {"source": "tdnet", "announcedAt": "2026-06-01T00:00:00Z", "docId": None, "sourceUrl": None})
        self.assertEqual(bundle["incomeStatements"][0]["provenance"]["sourceUrl"], EDINET)
        self.assertIsNone(bundle["cashFlows"][0]["freeCashFlow"])  # Non-scalar values are dropped.
        self.assertEqual(bundle["workforce"]["parentSegments"], [])
        self.assertIsNone(bundle["diversity"]["sourceUrl"])  # Only EDINET pages survive.
        self.assertEqual(bundle["segments"]["current"]["items"][0], {"segment": "A", "metric": "net_sales_total", "rawLabel": "r", "value": 5, "periodEnd": None})

    def test_saved_demo_uses_only_whitelisted_fields(self):
        demo = json.loads((TEMPLATE / "demo.json").read_text(encoding="utf-8"))
        allowed = set(server.INCOME + server.BALANCE + server.CASH + server.FORECAST + server.SEGMENTS + server.SEGMENT_ITEM
                      + server.WORKFORCE + server.DIVERSITY_VALUES)
        allowed |= {"placeholder", "bundles", "retrievedAt", "incomeStatements", "balanceSheets", "cashFlows", "segments", "current",
                    "previous", "previousRequested", "forecasts", "workforce", "diversity", "provenance", "source", "announcedAt",
                    "docId", "sourceUrl", "items", "parentSegments", "employees", "reportingCompany", "subsidiaries", "name"}
        self.assertLessEqual(set(keys(demo)), allowed)

    def test_too_many_rows_is_invalid(self):
        def many(path, params, key):
            return [statement("2026-03")] * 6
        with self.assertRaises(ValueError):
            server.fetch_bundle("7203", "k", many)


class BuildDemoTests(unittest.TestCase):
    def test_writes_bundles_and_never_partial_files(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "demo.json"
            api = FakeApi()
            build_demo.build(["7203", "9983"], "k", api, out)
            saved = json.loads(out.read_text(encoding="utf-8"))
            self.assertIs(saved["placeholder"], False)
            self.assertEqual([b["symbol"] for b in saved["bundles"]], ["7203", "9983"])
            self.assertEqual(len(api.calls), 16)
            self.assertEqual({c[2] for c in api.calls}, {"k"})
            self.assertNotIn('"k"', out.read_text(encoding="utf-8"))
            out.write_text("previous", encoding="utf-8")
            with self.assertRaises(server.ZenithError):
                build_demo.build(["7203", "9983"], "k", FakeApi(fail_on=12), out)
            self.assertEqual(out.read_text(encoding="utf-8"), "previous")
        self.assertEqual(build_demo.DEFAULT_SYMBOLS, ("7203", "9983", "4452"))


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.server = server.make_server(0, "test-private-key", self.api)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_port
        self.token = self.get("/api/config")[1]["requestToken"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            content = response.read()
            kind = response.headers.get("Content-Type", "")
            return response.status, json.loads(content) if "json" in kind else content, response.headers

    def get(self, path, headers=None):
        return self.request(path, headers=headers)

    def headers(self, **extra):
        return dict({"Content-Type": "application/json", "Origin": self.base, "X-Local-Token": self.token}, **extra)

    def test_static_files_and_demo_never_fetch(self):
        for path in ["/", "/app.mjs", "/model.mjs", "/charts.mjs", "/i18n.mjs", "/style.css", "/api/demo"]:
            status, data, headers = self.get(path)
            self.assertEqual(status, 200, path)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
            self.assertNotIn(b"test-private-key", data if isinstance(data, bytes) else json.dumps(data).encode())
        for path in ["/../demo.json", "/demo.json", "/server.py", "/build_demo.py", "/api/bundle"]:
            self.assertEqual(self.get(path)[0], 404, path)
        self.assertEqual(self.api.calls, [])

    def test_live_fetch_returns_the_bundle_and_keeps_the_key_server_side(self):
        status, data, _ = self.request("/api/bundle", {"symbol": "7203"}, self.headers())
        self.assertEqual(status, 200)
        self.assertEqual(data["symbol"], "7203")
        self.assertEqual(len(self.api.calls), 8)
        self.assertEqual({c[2] for c in self.api.calls}, {"test-private-key"})
        self.assertNotIn("test-private-key", json.dumps(data))
        for field in PRICE_FIELDS + ("archiveUrl",):
            self.assertNotIn(field, set(keys(data)))

    def test_wrong_host_origin_or_token_is_rejected(self):
        for headers in [{}, self.headers(Origin="https://example.com"), self.headers(**{"X-Local-Token": "wrong"}),
                        {k: v for k, v in self.headers().items() if k != "X-Local-Token"}, self.headers(Host="evil.example")]:
            self.assertEqual(self.request("/api/bundle", {"symbol": "7203"}, headers)[0], 403)
        self.assertEqual(self.get("/api/config", {"Host": "evil.example"})[0], 403)
        self.assertEqual(self.get("/", {"Host": "localhost:%d" % self.server.server_port})[0], 403)
        self.assertEqual(self.api.calls, [])

    def test_bad_symbols_and_bodies_never_fetch(self):
        for value in ["https://example.com", "7203&key=x", "", "72", "7203.TT", "abcd", 123, None]:
            status, data, _ = self.request("/api/bundle", {"symbol": value}, self.headers())
            self.assertEqual(status, 400, value)
        for raw, headers in [(b"not json", self.headers()), (json.dumps({"symbol": "7203", "x": 1}).encode(), self.headers()),
                             (b"[]", self.headers()), (b'{"symbol":"' + b"7" * 300 + b'"}', self.headers()),
                             (b'{"symbol":"7203"}', self.headers(**{"Content-Type": "text/plain"}))]:
            self.assertEqual(self.request("/api/bundle", raw=raw, headers=headers)[0], 400)
        self.assertEqual(self.request("/api/other", {"symbol": "7203"}, self.headers())[0], 404)
        self.assertEqual(self.api.calls, [])

    def test_upstream_error_aborts_without_exposing_upstream_text(self):
        self.api.fail_on = 3
        status, data, _ = self.request("/api/bundle", {"symbol": "7203"}, self.headers())
        self.assertEqual((status, data), (502, {"error": "upstream_failed"}))
        self.assertEqual(len(self.api.calls), 3)  # No further requests and no retries.

    def test_unexpected_shapes_are_invalid_response(self):
        self.server.shutdown()
        self.server.server_close()
        self.server = server.make_server(0, "k", lambda path, params, key: [{"symbol": "7203", "fiscalPeriod": "2026-03"}] * 6)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_port
        self.token = self.get("/api/config")[1]["requestToken"]
        self.assertEqual(self.request("/api/bundle", {"symbol": "7203"}, self.headers())[1], {"error": "invalid_response"})

    def test_concurrent_fetch_is_busy(self):
        entered, release = threading.Event(), threading.Event()
        inner = self.api

        def slow(path, params, key):
            entered.set()
            release.wait(5)
            return inner(path, params, key)
        self.server.shutdown()
        self.server.server_close()
        self.server = server.make_server(0, "k", slow)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_port
        self.token = self.get("/api/config")[1]["requestToken"]
        results = []
        first = threading.Thread(target=lambda: results.append(self.request("/api/bundle", {"symbol": "7203"}, self.headers())[0]))
        first.start()
        self.assertTrue(entered.wait(5))
        self.assertEqual(self.request("/api/bundle", {"symbol": "7203"}, self.headers())[1], {"error": "busy"})
        release.set()
        first.join(5)
        self.assertEqual(results, [200])

    def test_without_a_key_live_fetch_is_disabled(self):
        quiet = server.make_server(0, requester=lambda *args: self.fail("unexpected live call"))
        thread = threading.Thread(target=quiet.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:%d" % quiet.server_port
        try:
            with urllib.request.urlopen(base + "/api/config") as response:
                config = json.load(response)
            self.assertFalse(config["liveEnabled"])
            req = urllib.request.Request(base + "/api/bundle", data=b'{"symbol":"7203"}', headers={
                "Content-Type": "application/json", "Origin": base, "X-Local-Token": config["requestToken"]})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(req)
            self.assertEqual(error.exception.code, 403)
        finally:
            quiet.shutdown()
            quiet.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
