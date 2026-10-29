#!/usr/bin/env python3
"""Private, loopback-only company deep-dive workspace. Python 3.9+, no packages."""
import argparse
from datetime import datetime, timezone
import getpass
import json
import math
import os
from pathlib import Path
import re
import secrets
import sys
import threading
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "python"))
from zenith_examples import ZenithError, request_rows  # noqa: E402

STATIC = {"/": ("index.html", "text/html"), "/app.mjs": ("app.mjs", "text/javascript"),
          "/model.mjs": ("model.mjs", "text/javascript"), "/charts.mjs": ("charts.mjs", "text/javascript"),
          "/i18n.mjs": ("i18n.mjs", "text/javascript"), "/style.css": ("style.css", "text/css")}
SYMBOL = re.compile(r"[0-9A-Z]{4,5}(?:\.T)?")
PERIOD = re.compile(r"\d{4}-(0[1-9]|1[0-2])")
EDINET_DOC = re.compile(r"S[0-9A-Z]{7}")
ANNUAL = {"period": "annual", "limit": 5}

# Field whitelists per endpoint. Anything not listed (prices, price-derived ratios such as
# perForecast/psrForecast/pegRatioForecast, TDnet document links) never reaches the browser.
ROW_META = ("symbol", "fiscalPeriod", "period", "accountingStandard", "updatedAt", "fiscalPeriodDays")
INCOME = ROW_META + ("revenue", "operatingIncome", "netIncome", "netIncomeAttributableToOwners",
                     "operatingMargin", "netMargin")
BALANCE = ROW_META + ("totalAssets", "ownersEquity", "equityRatio", "interestBearingDebt",
                      "netInterestBearingDebt", "cashAndCashEquivalents")
CASH = ROW_META + ("operatingCashFlow", "investingCashFlow", "financingCashFlow", "capitalExpenditure",
                   "freeCashFlow", "dividendsPaid", "purchaseOfTreasuryStock", "depreciationAndAmortization")
FORECAST = ("symbol", "fiscalPeriod", "period", "forecastTarget", "forecastFiscalPeriod", "accountingStandard",
            "announcedAt", "source", "revenueForecast", "operatingIncomeForecast", "netIncomeForecast",
            "epsForecast", "operatingMarginForecast", "netMarginForecast", "payoutRatioForecast", "roeForecast")
DOCUMENT = ("symbol", "fiscalPeriod", "period", "docTypeCode", "submittedAt")
SEGMENTS = DOCUMENT + ("unitMultiplier", "note")
SEGMENT_ITEM = ("segment", "metric", "rawLabel", "value", "periodEnd")
WORKFORCE = DOCUMENT + ("employees", "consolidatedEmployees", "averageAge", "averageTenureYears",
                        "averageAnnualSalary")
DIVERSITY_VALUES = ("femaleManagerRatio", "maleChildcareLeaveRatio", "maleChildcareLeaveBasis",
                    "wageGapAll", "wageGapRegular", "wageGapNonRegular")


def _scalar(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value[:500]
    return None  # Nested or unexpected values are dropped, not passed through.


def _pick(row, fields):
    return {field: _scalar(row.get(field)) for field in fields} if isinstance(row, dict) else {}


def edinet_url(value):
    if not isinstance(value, str):
        return None
    parts = urlsplit(value)
    host = parts.hostname or ""
    ok = parts.scheme == "https" and (host == "edinet-fsa.go.jp" or host.endswith(".edinet-fsa.go.jp"))
    return value[:500] if ok else None


def _edinet_doc(row):
    """docId and an EDINET page only; TDnet IDs (18 digits) and archive links are dropped."""
    doc = row.get("docId")
    return {"docId": doc if isinstance(doc, str) and EDINET_DOC.fullmatch(doc) else None,
            "sourceUrl": edinet_url(row.get("sourceUrl"))}


def _provenance(value):
    if not isinstance(value, dict):
        return None
    source = _scalar(value.get("source"))
    out = {"source": source, "announcedAt": _scalar(value.get("announcedAt")), "docId": None, "sourceUrl": None}
    if source != "tdnet":
        out.update(_edinet_doc(value))
    return out  # archiveUrl is never copied.


def clean_statement(row, fields):
    out = _pick(row, fields)
    out["provenance"] = _provenance(row.get("provenance"))
    return out


def clean_forecast(row):
    out = _pick(row, FORECAST)
    out.update({"docId": None, "sourceUrl": None})
    if row.get("source") != "tdnet":
        out.update(_edinet_doc(row))
    return out


def clean_segments(row):
    if row is None:
        return None
    out = _pick(row, SEGMENTS)
    out.update(_edinet_doc(row))
    items = row.get("items")
    out["items"] = [_pick(item, SEGMENT_ITEM) for item in items if isinstance(item, dict)][:400] \
        if isinstance(items, list) else []
    return out


def clean_workforce(row):
    if row is None:
        return None
    out = _pick(row, WORKFORCE)
    out.update(_edinet_doc(row))
    for key in ("segments", "parentSegments"):
        values = row.get(key)
        out[key] = [_pick(s, ("segment", "employees")) for s in values if isinstance(s, dict)][:100] \
            if isinstance(values, list) else []
    return out


def clean_diversity(row):
    if row is None:
        return None
    out = _pick(row, DOCUMENT)
    out.update(_edinet_doc(row))
    out["reportingCompany"] = _pick(row.get("reportingCompany"), DIVERSITY_VALUES) \
        if isinstance(row.get("reportingCompany"), dict) else None
    subsidiaries = row.get("subsidiaries")
    out["subsidiaries"] = [_pick(s, ("name",) + DIVERSITY_VALUES) for s in subsidiaries if isinstance(s, dict)][:50] \
        if isinstance(subsidiaries, list) else []
    return out


def _latest(rows):
    candidates = [r for r in rows if isinstance(r.get("fiscalPeriod"), str) and PERIOD.fullmatch(r["fiscalPeriod"])]
    return max(candidates, key=lambda r: r["fiscalPeriod"]) if candidates else None


def _months_before(period, months):
    total = int(period[:4]) * 12 + int(period[5:]) - 1 - months
    return "%04d-%02d" % (total // 12, total % 12 + 1)


def previous_fiscal_period(segment_period, income_rows):
    """The annual period before the latest segment report: the preceding income-statement FY
    (handles fiscal-year-end changes), else 12 months earlier."""
    earlier = [r["fiscalPeriod"] for r in income_rows
               if isinstance(r.get("fiscalPeriod"), str) and PERIOD.fullmatch(r["fiscalPeriod"])
               and r["fiscalPeriod"] < segment_period]
    return max(earlier) if earlier else _months_before(segment_period, 12)


def fetch_bundle(symbol, api_key, requester=request_rows):
    """Fetch and whitelist everything the four views need for one company.

    Returns exactly the JSON the browser receives (and what build_demo.py saves in demo.json).
    Requests run one after another; the first failure aborts the whole fetch (no partial
    result, no retry). 8 requests, or 7 when the company has no segment report.
    """
    def get(path, params, limit):
        rows = requester(path, dict({"symbol": symbol}, **params), api_key)
        if len(rows) > limit:
            raise ValueError("too many rows")
        return rows
    income = get("/income-statement", ANNUAL, 5)
    balance = get("/balance-sheet-statement", ANNUAL, 5)
    cash = get("/cash-flow-statement", ANNUAL, 5)
    segments = _latest(get("/segments", {}, 20))
    previous, requested = None, None
    if segments is not None:
        requested = previous_fiscal_period(segments["fiscalPeriod"], income)
        matches = [r for r in get("/segments", {"fiscalPeriod": requested}, 20) if r.get("fiscalPeriod") == requested]
        previous = matches[0] if matches else None
    forecasts = get("/earnings-forecast", {"limit": 20}, 40)
    workforce = _latest(get("/workforce", {}, 20))
    diversity = _latest(get("/diversity", {}, 20))
    return {
        "symbol": symbol,
        "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "incomeStatements": [clean_statement(r, INCOME) for r in income],
        "balanceSheets": [clean_statement(r, BALANCE) for r in balance],
        "cashFlows": [clean_statement(r, CASH) for r in cash],
        "segments": {"current": clean_segments(segments), "previous": clean_segments(previous),
                     "previousRequested": requested},
        "forecasts": [clean_forecast(r) for r in forecasts],
        "workforce": clean_workforce(workforce),
        "diversity": clean_diversity(diversity),
    }


def make_server(port=8790, api_key="", requester=request_rows):
    token = secrets.token_urlsafe(32)
    gate = threading.Lock()
    demo = json.loads((ROOT / "demo.json").read_text(encoding="utf-8"))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # No request bodies, data, symbols or keys in access logs.

        def reply(self, status, content, kind="application/json"):
            if kind == "application/json":
                content = json.dumps(content, ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", kind + "; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(content)

        def allowed_host(self):
            # Reject DNS rebinding and access through a public hostname/proxy.
            if self.headers.get("Host") != "127.0.0.1:%d" % self.server.server_port:
                self.reply(403, {"error": "local_only"})
                return False
            return True

        def do_GET(self):
            if not self.allowed_host():
                return
            path = urlsplit(self.path).path
            if path in STATIC:
                file, kind = STATIC[path]
                self.reply(200, (ROOT / file).read_bytes(), kind)
            elif path == "/api/config":
                self.reply(200, {"liveEnabled": bool(api_key), "requestToken": token})
            elif path == "/api/demo":
                self.reply(200, demo)
            else:
                self.reply(404, {"error": "not_found"})

        def do_POST(self):
            if not self.allowed_host():
                return
            expected = "http://127.0.0.1:%d" % self.server.server_port
            if self.headers.get("Origin") != expected or not secrets.compare_digest(self.headers.get("X-Local-Token", ""), token):
                self.reply(403, {"error": "local_only"})
                return
            if self.path != "/api/bundle":
                self.reply(404, {"error": "not_found"})
                return
            if not api_key:
                self.reply(403, {"error": "setup_required"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 256 or self.headers.get("Content-Type") != "application/json":
                    raise ValueError()
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict) or set(body) != {"symbol"} or not isinstance(body["symbol"], str):
                    raise ValueError()
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "invalid_request"})
                return
            # Validate before any request; do not let UI requests create parallel API bursts.
            if not SYMBOL.fullmatch(body["symbol"]):
                self.reply(400, {"error": "invalid_symbol"})
                return
            if not gate.acquire(blocking=False):
                self.reply(429, {"error": "busy"})
                return
            try:
                self.reply(200, fetch_bundle(body["symbol"], api_key, requester))
            except ZenithError:
                # Never relay exception bodies or upstream content into the UI.
                self.reply(502, {"error": "upstream_failed"})
            except (ValueError, TypeError, KeyError, OverflowError, AttributeError):
                self.reply(502, {"error": "invalid_response"})
            finally:
                gate.release()

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--live", action="store_true", help="Enable private API access; key stays in this process")
    args = parser.parse_args()
    key = ""
    if args.live:
        key = os.environ.get("ZENITH_API_KEY", "").strip()
        if not key and sys.stdin.isatty():
            key = getpass.getpass("ZENITH API key (hidden): ").strip()
        if not key:
            parser.error("Set ZENITH_API_KEY or run interactively. Do not pass a key on the command line.")
    if not 1024 <= args.port <= 65535:
        parser.error("Use a port from 1024 to 65535.")
    with make_server(args.port, key) as server:
        print("Open http://127.0.0.1:%d" % server.server_port, flush=True)
        print("Synthetic demo ready. Live access: %s. Ctrl+C to stop." % (
            "enabled; each fetch makes up to 8 requests and requires a click" if key else "disabled"), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
