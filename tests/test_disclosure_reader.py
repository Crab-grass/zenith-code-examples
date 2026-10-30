import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates/disclosure-reader"


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, TEMPLATE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load("disclosure_reader_server_test", "server.py")
build_demo = load("disclosure_reader_build_demo_test", "build_demo.py")

EDINET = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100ABCD"
ARCHIVE = "https://api.zenithcode.net/stable/filing-document?docId=S100ABCD&type=pdf"
PRICE_FIELDS = ("price", "priceDate", "marketCap", "beta", "per", "pbr", "dividendYield")


def doc(symbol, **extra):
    row = {"symbol": symbol, "fiscalPeriod": "2026-03", "period": "FY", "docId": "S100ABCD", "docTypeCode": "120",
           "submittedAt": "2026-06-10 06:33:00", "sourceUrl": EDINET, "archiveUrl": ARCHIVE}
    row.update(extra)
    return row


class FakeApi:
    """Answers like the API, including fields the server must strip, and 404s for missing disclosures."""

    def __init__(self, fail_on=None, customers=True, missing=("capex",)):
        self.calls, self.fail_on, self.customers, self.missing = [], fail_on, customers, missing

    def __call__(self, path, params, key):
        self.calls.append((path, dict(params), key))
        if self.fail_on == len(self.calls):
            raise server.ZenithError("HTTP 401. private-upstream-detail")
        s = params["symbol"]
        if path == "/profile":
            return [{"symbol": s, "nameJa": "テスト" + s, "nameEn": "Test", "isEtf": False, "assetType": "EQUITY", "price": 2500,
                     "marketCap": 1e13, "per": 9.1, "pbr": 1.1, "beta": 1.0, "dividendYield": 0.03, "priceDate": "2026-10-30",
                     "address": "愛知県豊田市トヨタ町１番地", "descriptionJa": "x"}]
        if path == "/text-blocks":
            if params["tag"] in self.missing:
                raise server.ZenithError("HTTP 404. Check the symbol and available coverage.")
            return [doc(s, tag="jpcrp_cor:BusinessRisksTextBlock", labelJa="事業等のリスク", label="事業等のリスク", chars=99999,
                        contentFormat="text", content="（１）為替\n本文。" + "あ" * 10, blocks=[{"tag": "x"}])]
        if path == "/major-shareholders":
            return [{"symbol": s, "fiscalPeriod": "2026-03", "rank": 1, "holderName": "株式会社豊田自動織機", "holderNameRaw": "㈱豊田自動織機",
                     "agent": "常任代理人 x", "address": "愛知県刈谷市豊田町二丁目１番地", "shares": 1000, "unit": "株", "ratio": 0.09,
                     "source": "major", "docId": "S100ABCD", "sourceUrl": EDINET},
                    {"symbol": s, "fiscalPeriod": "2026-03", "rank": 2, "holderName": "STATE STREET", "address": "One Congress Street, Boston （東京都港区）",
                     "shares": 900, "unit": "株", "ratio": 0.05, "docId": "S100ABCD", "sourceUrl": "https://example.com/x"}]
        if path == "/shareholder-categories":
            cats = [{"category": "financialInstitutions", "labelJa": "金融機関", "labelEn": "FI", "shareholders": 1, "units": 5, "ratio": 0.5, "label": "x"},
                    {"category": "total", "labelJa": "計", "labelEn": "Total", "shareholders": 2, "units": 10, "ratio": None}]
            return [doc(s, classes=[{"members": ["jpcrp_cor_ClassAShares"], "contextId": "a", "categories": []},
                                    {"members": ["jpcrp_cor_OrdinaryShare"], "contextId": "b", "categories": cats}])]
        if path == "/large-holders":
            row = {"symbol": s, "fiscalPeriod": None, "rank": None, "holderName": "株式会社豊田自動織機", "holderNameRaw": "x", "agent": None,
                   "address": None, "shares": 10, "unit": "株", "ratio": 0.09, "source": "large_holding_report",
                   "submittedAt": "2026-05-08 07:08:00+00", "docId": "S100Y2HX", "sourceUrl": EDINET, "archiveUrl": ARCHIVE}
            return [row, dict(row, submittedAt="2026-05-08 07:14:00+00")]
        if path == "/cross-shareholdings":
            return [doc(s, holders=[{"holder": "reporting", "companyName": None}],
                        summary=[{"holder": "reporting", "purpose": "nonPureInvestment", "listing": "listed", "issues": 1,
                                  "carryingAmount": 83994000000, "priorIssues": None, "priorCarryingAmount": 1}],
                        holdings=[{"holder": "reporting", "type": "specified", "row": 1, "name": "マツダ㈱", "shares": 5, "priorShares": 5,
                                   "carryingAmount": 58683000000, "priorCarryingAmount": 1602000000, "purpose": None, "rationale": "取引" * 800,
                                   "quantitativeEffect": "q", "increaseReason": None, "businessAlliance": None, "issuerHoldsOwnShares": "有"}])]
        if path == "/audit-fees":
            part = {"reportingCompany": 20000000, "consolidatedSubsidiaries": None, "total": None, "extra": 1}
            return [doc(s, fees=[{"period": "current", "audit": part, "nonAudit": part, "networkAudit": None, "networkNonAudit": "bad", "nonAuditRatio": None}])]
        if path == "/main-customers":
            if not self.customers:
                raise server.ZenithError("HTTP 404. Check the symbol and available coverage.")
            return [doc(s, sourceTag="jpcrp_cor:InformationForEachOfMainCustomersTextBlock",
                        customers=[{"period": "current", "customer": "A社", "revenue": 718808000, "segment": "x", "note": "y"}])]
        if path == "/income-statement":
            return [{"symbol": s, "fiscalPeriod": "2026-03", "period": "FY", "accountingStandard": "jgaap", "revenue": 5594277000,
                     "costOfRevenue": 1, "eps": 496.56, "operatingIncome": 9, "provenance": {"archiveUrl": ARCHIVE}}]
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
    def test_request_order_and_count(self):
        api = FakeApi()
        bundle = server.fetch_bundle(["7203", "7261"], "k", api)
        first = [(p, q) for p, q, _ in api.calls[:13]]
        self.assertEqual(first, [("/profile", {"symbol": "7203"})] + [
            ("/text-blocks", {"symbol": "7203", "tag": tag}) for tag in ("risks", "policy", "rnd", "capex", "audits")] + [
            ("/major-shareholders", {"symbol": "7203"}), ("/shareholder-categories", {"symbol": "7203"}), ("/large-holders", {"symbol": "7203"}),
            ("/cross-shareholdings", {"symbol": "7203"}), ("/audit-fees", {"symbol": "7203"}), ("/main-customers", {"symbol": "7203"}),
            ("/income-statement", {"symbol": "7203", "period": "annual", "limit": 3})])
        self.assertEqual(len(api.calls), 26)
        self.assertEqual([c["symbol"] for c in bundle["companies"]], ["7203", "7261"])

    def test_no_main_customers_means_no_revenue_request(self):
        api = FakeApi(customers=False)
        bundle = server.fetch_bundle(["7203", "7261"], "k", api)
        self.assertEqual(len(api.calls), 24)
        self.assertNotIn("/income-statement", [c[0] for c in api.calls])
        company = bundle["companies"][0]
        self.assertIsNone(company["mainCustomers"])  # 404 = no customer at 10% or more
        self.assertEqual(company["revenue"], [])
        self.assertIsNone(company["texts"]["capex"])  # 404 = the section does not exist

    def test_whitelist_drops_prices_carrying_amounts_and_tdnet_links(self):
        bundle = server.fetch_bundle(["7203", "7261"], "k", FakeApi())
        found = set(keys(bundle))
        for field in PRICE_FIELDS + ("archiveUrl", "carryingAmount", "priorCarryingAmount", "chars", "address", "holderNameRaw", "agent",
                                     "sourceTag", "quantitativeEffect", "blocks", "costOfRevenue", "eps", "operatingIncome", "provenance",
                                     "descriptionJa", "extra", "note", "source"):
            self.assertNotIn(field, found, field)
        text = json.dumps(bundle, ensure_ascii=False)
        for needle in ("filing-document", "example.com", "83994000000", "58683000000", "刈谷市"):
            self.assertNotIn(needle, text)
        company = bundle["companies"][0]
        self.assertEqual(company["profile"], {"symbol": "7203", "nameJa": "テスト7203", "nameEn": "Test", "isEtf": False, "assetType": "EQUITY"})
        self.assertEqual([r["region"] for r in company["majorShareholders"]], ["愛知県", "overseas"])
        self.assertIsNone(company["majorShareholders"][1]["sourceUrl"])  # only EDINET pages survive
        self.assertEqual(company["revenue"], [{"symbol": "7203", "fiscalPeriod": "2026-03", "period": "FY", "revenue": 5594277000}])
        self.assertEqual(company["crossShareholdings"]["summary"], [
            {"holder": "reporting", "purpose": "nonPureInvestment", "listing": "listed", "issues": 1, "priorIssues": None}])
        self.assertEqual(len(company["crossShareholdings"]["holdings"][0]["rationale"]), 1200)
        self.assertEqual(company["shareholderCategories"]["categories"][0]["category"], "financialInstitutions")  # ordinary shares
        fee = company["auditFees"]["fees"][0]
        self.assertEqual(fee["audit"], {"reportingCompany": 20000000, "consolidatedSubsidiaries": None, "total": None})
        self.assertIsNone(fee["networkAudit"])
        self.assertIsNone(fee["networkNonAudit"])
        block = company["texts"]["risks"]
        self.assertEqual(block["content"], "（１）為替\n本文。" + "あ" * 10)
        self.assertFalse(block["truncated"])
        self.assertEqual(len(company["largeHolders"]), 2)  # duplicates are merged in the browser (model.mjs)
        self.assertEqual(company["largeHolders"][0]["submittedAt"], "2026-05-08 07:14:00+00")

    def test_long_text_is_cut_and_flagged(self):
        rows = [doc("7203", content="あ" * (server.MAX_CONTENT + 5))]
        block = server.clean_text(rows, "7203")
        self.assertEqual(len(block["content"]), server.MAX_CONTENT)
        self.assertTrue(block["truncated"])

    def test_rows_of_another_company_or_errors_abort(self):
        def other(path, params, key):
            return [{"symbol": "9999", "nameJa": "x"}]
        with self.assertRaises(ValueError):
            server.fetch_bundle(["7203", "7261"], "k", other)

        def denied(path, params, key):
            if path == "/major-shareholders":
                raise server.ZenithError("HTTP 403. Check account permissions")
            return FakeApi()(path, params, key)
        with self.assertRaises(server.ZenithError):  # only a 404 means "not disclosed"
            server.fetch_bundle(["7203", "7261"], "k", denied)

    def test_region_and_links(self):
        self.assertEqual(server.region("東京都港区赤坂一丁目８番１号"), "東京都")
        self.assertEqual(server.region("大阪府大阪市中央区"), "大阪府")
        self.assertEqual(server.region("神奈川県逗子市"), "神奈川県")
        self.assertEqual(server.region("北海道札幌市"), "北海道")
        self.assertEqual(server.region("米国・ニューヨーク (東京都千代田区)"), "overseas")
        self.assertIsNone(server.region(None))
        self.assertIsNone(server.edinet_url(ARCHIVE))
        self.assertIsNone(server.edinet_url("https://www.release.tdnet.info/inbs/x.pdf"))
        self.assertEqual(server.edinet_url(EDINET), EDINET)

    def test_body_validation(self):
        self.assertEqual(server.parse_body({"symbols": ["7203", "130A"]}), ["7203", "130A"])
        for body in [{"symbols": ["7203"]}, {"symbols": ["7203"] * 2}, {"symbols": ["7203", "7203.T"]}, {"symbols": ["1", "2", "3", "4", "5", "6"]},
                     {"symbols": ["7203", "x&y"]}, {"symbols": "7203,7261"}, {"symbols": ["7203", "7261"], "x": 1}, [], None,
                     {"symbols": ["7203", "7261", "6902", "7267", "7217", "7201"]}]:
            with self.assertRaises(ValueError):
                server.parse_body(body)

    def test_saved_demo_uses_only_whitelisted_fields(self):
        demo = json.loads((TEMPLATE / "demo.json").read_text(encoding="utf-8"))
        allowed = set(server.DOC + server.PROFILE + server.TEXT + server.MAJOR + server.CATEGORY + server.LARGE + server.CROSS_HOLDER
                      + server.CROSS_SUMMARY + server.CROSS_HOLDING + server.FEE_PARTS + server.FEE_SCOPE + server.CUSTOMER + server.REVENUE)
        allowed |= {"placeholder", "retrievedAt", "companies", "profile", "texts", "content", "truncated", "docId", "sourceUrl", "region",
                    "majorShareholders", "shareholderCategories", "categories", "largeHolders", "crossShareholdings", "holders", "summary",
                    "holdings", "rationale", "auditFees", "fees", "nonAuditRatio", "mainCustomers", "customers", "revenue"} | set(server.SECTIONS)
        self.assertLessEqual(set(keys(demo)), allowed)
        self.assertIs(demo["placeholder"], False)
        build_demo.check(demo)  # the same last-line check build_demo.py runs before writing


class BuildDemoTests(unittest.TestCase):
    def test_writes_snapshot_and_never_partial_files(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "demo.json"
            api = FakeApi()
            build_demo.build(["7203", "7261"], "k", api, out)
            saved = json.loads(out.read_text(encoding="utf-8"))
            self.assertIs(saved["placeholder"], False)
            self.assertEqual([c["symbol"] for c in saved["companies"]], ["7203", "7261"])
            self.assertEqual(len(api.calls), 26)
            self.assertEqual({c[2] for c in api.calls}, {"k"})
            self.assertNotIn('"k"', out.read_text(encoding="utf-8"))
            out.write_text("previous", encoding="utf-8")
            with self.assertRaises(server.ZenithError):
                build_demo.build(["7203", "7261"], "k", FakeApi(fail_on=20), out)
            self.assertEqual(out.read_text(encoding="utf-8"), "previous")
        self.assertEqual(build_demo.DEFAULT_SYMBOLS, ("7203", "6902", "7267", "7261", "7217"))

    def test_last_line_check_refuses_banned_fields_and_links(self):
        for bad in [{"a": {"carryingAmount": 1}}, {"price": 1}, [{"archiveUrl": "x"}], {"u": "https://www.release.tdnet.info/x.pdf"}]:
            with self.assertRaises(ValueError):
                build_demo.check(bad)
        build_demo.check({"sourceUrl": EDINET, "content": "本文"})


class ServerTests(unittest.TestCase):
    def start(self, key="test-private-key", requester=None):
        self.api = requester or FakeApi()
        self.server = server.make_server(0, key, self.api)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_port
        self.token = self.request("/api/config")[1]["requestToken"]

    def setUp(self):
        self.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def restart(self, key="k", requester=None):
        self.tearDown()
        self.start(key, requester)

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

    def headers(self, **extra):
        return dict({"Content-Type": "application/json", "Origin": self.base, "X-Local-Token": self.token}, **extra)

    def test_static_files_and_demo_never_fetch(self):
        for path in ["/", "/app.mjs", "/model.mjs", "/i18n.mjs", "/style.css", "/api/demo"]:
            status, data, headers = self.request(path)
            self.assertEqual(status, 200, path)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
            self.assertNotIn(b"test-private-key", data if isinstance(data, bytes) else json.dumps(data).encode())
        for path in ["/../demo.json", "/demo.json", "/server.py", "/build_demo.py", "/api/compare"]:
            self.assertEqual(self.request(path)[0], 404, path)
        status, config, _ = self.request("/api/config")
        self.assertEqual((config["minCompanies"], config["maxCompanies"], config["liveEnabled"]), (2, 5, True))
        self.assertEqual(self.api.calls, [])

    def test_live_fetch_keeps_the_key_server_side(self):
        status, data, _ = self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())
        self.assertEqual(status, 200)
        self.assertEqual(data["mode"], "live")
        self.assertEqual(len(self.api.calls), 26)
        self.assertEqual({c[2] for c in self.api.calls}, {"test-private-key"})
        self.assertNotIn("test-private-key", json.dumps(data))
        for field in PRICE_FIELDS + ("archiveUrl", "carryingAmount"):
            self.assertNotIn(field, set(keys(data)))

    def test_wrong_host_origin_or_token_is_rejected(self):
        body = {"symbols": ["7203", "7261"]}
        for headers in [{}, self.headers(Origin="https://example.com"), self.headers(**{"X-Local-Token": "wrong"}),
                        {k: v for k, v in self.headers().items() if k != "X-Local-Token"}, self.headers(Host="evil.example")]:
            self.assertEqual(self.request("/api/compare", body, headers)[0], 403)
        self.assertEqual(self.request("/api/config", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("/", headers={"Host": "localhost:%d" % self.server.server_port})[0], 403)
        self.assertEqual(self.api.calls, [])

    def test_bad_bodies_never_fetch(self):
        for raw, headers in [(b"not json", self.headers()), (b'{"symbols":["7203"]}', self.headers()),
                             (b'{"symbols":["7203","https://example.com"]}', self.headers()),
                             (b'{"symbols":["' + b"7" * 600 + b'"]}', self.headers()),
                             (b'{"symbols":["7203","7261"]}', self.headers(**{"Content-Type": "text/plain"}))]:
            self.assertEqual(self.request("/api/compare", raw=raw, headers=headers)[0], 400, raw[:40])
        self.assertEqual(self.request("/api/other", {"symbols": ["7203", "7261"]}, self.headers())[0], 404)
        self.assertEqual(self.api.calls, [])

    def test_upstream_error_aborts_without_exposing_upstream_text(self):
        self.api.fail_on = 3
        status, data, _ = self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())
        self.assertEqual((status, data), (502, {"error": "upstream_failed"}))
        self.assertEqual(len(self.api.calls), 3)  # no further requests and no retries

    def test_unexpected_shapes_are_invalid_response(self):
        self.restart(requester=lambda path, params, key: [{"symbol": "9999"}])
        self.assertEqual(self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())[1], {"error": "invalid_response"})

    def test_concurrent_fetch_is_busy(self):
        entered, release = threading.Event(), threading.Event()
        inner = FakeApi()

        def slow(path, params, key):
            entered.set()
            release.wait(5)
            return inner(path, params, key)
        self.restart(requester=slow)
        results = []
        first = threading.Thread(target=lambda: results.append(self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())[0]))
        first.start()
        self.assertTrue(entered.wait(5))
        self.assertEqual(self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())[1], {"error": "busy"})
        release.set()
        first.join(5)
        self.assertEqual(results, [200])

    def test_without_a_key_live_fetch_is_disabled(self):
        self.restart(key="", requester=lambda *args: self.fail("unexpected live call"))
        self.assertFalse(self.request("/api/config")[1]["liveEnabled"])
        self.assertEqual(self.request("/api/compare", {"symbols": ["7203", "7261"]}, self.headers())[0], 403)


if __name__ == "__main__":
    unittest.main()
