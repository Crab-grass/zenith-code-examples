#!/usr/bin/env python3
"""Private, loopback-only peer benchmark board. Python 3.9+, no packages."""
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
          "/model.mjs": ("model.mjs", "text/javascript"), "/style.css": ("style.css", "text/css")}
SYMBOL = re.compile(r"[0-9A-Z]{4,5}(?:\.T)?")
SECTOR = re.compile(r"[0-9]{4}")
MAX_COMPANIES = 6
MAX_BODY = 512

# Whitelists: anything not listed here never reaches the browser. /peers and
# /industry-benchmarks also return price-derived fields (price, marketCap, PER,
# PBR, dividend yield, ...); this template must not display them.
PEER_FIELDS = ("role", "symbol", "nameJa", "nameEn", "sector")
BENCHMARK_FIELDS = ("sector", "sectorJa", "sectorEn", "count") + tuple(
    metric + suffix for metric in ("roe", "roa", "revenueCagr3y", "epsCagr3y")
    for suffix in ("Count", "Q1", "Median", "Q3"))
ROW_META = ("symbol", "fiscalPeriod", "period", "accountingStandard", "fiscalPeriodDays", "updatedAt")
INCOME_FIELDS = ROW_META + ("revenue", "operatingIncome", "netIncome", "netIncomeAttributableToOwners",
                            "operatingMargin", "netMargin")
BALANCE_FIELDS = ROW_META + ("totalAssets", "ownersEquity", "shareholdersEquity", "equityRatio",
                             "interestBearingDebt", "netInterestBearingDebt")
CASH_FLOW_FIELDS = ROW_META + ("operatingCashFlow", "capitalExpenditure", "freeCashFlow")
FILING_FIELDS = ("symbol", "fiscalPeriod", "period", "docId", "submittedAt")
WORKFORCE_FIELDS = FILING_FIELDS + ("employees", "consolidatedEmployees", "averageAge",
                                    "averageTenureYears", "averageAnnualSalary")
DIVERSITY_FIELDS = ("femaleManagerRatio", "maleChildcareLeaveRatio", "maleChildcareLeaveBasis", "wageGapAll")
SEGMENT_ITEM_FIELDS = ("segment", "metric", "rawLabel", "value")


def _scalar(value):
    # Keep plain JSON scalars only; nested objects are projected explicitly.
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value[:300]
    return None


def _pick(row, fields):
    if not isinstance(row, dict):
        raise ValueError("row")
    return {field: _scalar(row.get(field)) for field in fields}


def edinet_url(value):
    """Only EDINET viewer links are passed on. TDnet and archive links are dropped."""
    if not isinstance(value, str):
        return None
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if parts.scheme == "https" and (host == "edinet-fsa.go.jp" or host.endswith(".edinet-fsa.go.jp")):
        return value[:300]
    return None


def _provenance(value):
    if not isinstance(value, dict):
        return None
    # archiveUrl is never forwarded; sourceUrl survives only for EDINET.
    return {"source": _scalar(value.get("source")), "docId": _scalar(value.get("docId")),
            "announcedAt": _scalar(value.get("announcedAt")), "sourceUrl": edinet_url(value.get("sourceUrl"))}


def _same(symbol, expected):
    return isinstance(symbol, str) and symbol.replace(".T", "") == expected.replace(".T", "")


def _rows(rows, expected, fields, limit):
    if not isinstance(rows, list) or len(rows) > limit:
        raise ValueError("rows")
    out = []
    for row in rows:
        item = _pick(row, fields)
        if not _same(item["symbol"], expected):
            raise ValueError("symbol")
        out.append(item)
    return out


def statement_rows(rows, expected, fields, limit):
    out = _rows(rows, expected, fields, limit)
    for item, row in zip(out, rows):
        item["provenance"] = _provenance(row.get("provenance"))
    return out


def segment_rows(rows, expected):
    out = _rows(rows, expected, FILING_FIELDS + ("unitMultiplier",), 12)
    for item, row in zip(out, rows):
        item["sourceUrl"] = edinet_url(row.get("sourceUrl"))
        items = row.get("items") if isinstance(row.get("items"), list) else []
        # Only external net sales are needed for the business-mix bar.
        item["items"] = [_pick(i, SEGMENT_ITEM_FIELDS) for i in items[:200]
                         if isinstance(i, dict) and i.get("metric") == "net_sales_total"]
    return out


def workforce_rows(rows, expected):
    out = _rows(rows, expected, WORKFORCE_FIELDS, 12)
    for item, row in zip(out, rows):
        item["sourceUrl"] = edinet_url(row.get("sourceUrl"))
    return out


def diversity_rows(rows, expected):
    out = _rows(rows, expected, FILING_FIELDS, 12)
    for item, row in zip(out, rows):
        item["sourceUrl"] = edinet_url(row.get("sourceUrl"))
        company = row.get("reportingCompany")
        # Subsidiary names and figures are not used and are not forwarded.
        item["reportingCompany"] = _pick(company, DIVERSITY_FIELDS) if isinstance(company, dict) else None
    return out


def peer_rows(rows, expected):
    if not isinstance(rows, list) or len(rows) > 20:
        raise ValueError("rows")
    picked = [_pick(row, PEER_FIELDS) for row in rows]
    target = next((r for r in picked if r["role"] == "target"), None)
    if not target or not _same(target["symbol"], expected):
        raise ValueError("target")
    peers = [r for r in picked if r["role"] == "peer" and isinstance(r["symbol"], str)
             and SYMBOL.fullmatch(r["symbol"]) and not _same(r["symbol"], expected)]
    # The sector-median row carries market-based figures only; it is dropped.
    return {"target": target, "peers": peers[:5]}


def benchmark_row(rows, sector):
    if not isinstance(rows, list):
        raise ValueError("rows")
    match = next((r for r in rows if isinstance(r, dict) and r.get("sector") == sector), None)
    return _pick(match, BENCHMARK_FIELDS) if match else None


def fetch_peers(symbol, api_key, requester=request_rows, limit=5):
    """Peer suggestions exactly as the browser receives them: names, codes and sector only (1 request)."""
    result = peer_rows(requester("/peers", {"symbol": symbol, "limit": limit}, api_key), symbol)
    return {"mode": "live", "retrievedAt": _now(), **result}


def fetch_bundle(symbols, api_key, requester=request_rows, sector=None):
    """The comparison exactly as the browser receives it, already whitelisted.

    6 requests per company plus 1 for the sector distribution when `sector` is given.
    Strictly sequential; the first exception aborts the whole bundle (no partial result).
    """
    companies = []
    for symbol in symbols:
        company = {"symbol": symbol}
        company["income"] = statement_rows(requester("/income-statement", {
            "symbol": symbol, "period": "annual", "limit": 4}, api_key), symbol, INCOME_FIELDS, 4)
        company["balance"] = statement_rows(requester("/balance-sheet-statement", {
            "symbol": symbol, "period": "annual", "limit": 1}, api_key), symbol, BALANCE_FIELDS, 1)
        company["cashFlow"] = statement_rows(requester("/cash-flow-statement", {
            "symbol": symbol, "period": "annual", "limit": 1}, api_key), symbol, CASH_FLOW_FIELDS, 1)
        company["segments"] = segment_rows(requester("/segments", {"symbol": symbol}, api_key), symbol)
        company["workforce"] = workforce_rows(requester("/workforce", {"symbol": symbol}, api_key), symbol)
        company["diversity"] = diversity_rows(requester("/diversity", {"symbol": symbol}, api_key), symbol)
        companies.append(company)
    benchmark = None
    if sector:
        benchmark = benchmark_row(requester("/industry-benchmarks", {"sector": sector}, api_key), sector)
    return {"mode": "live", "retrievedAt": _now(), "benchmark": benchmark, "companies": companies}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_body(path, body):
    """Return validated arguments or raise ValueError. Nothing is fetched before this passes."""
    if path == "/api/peers":
        if not isinstance(body, dict) or set(body) != {"symbol"}:
            raise ValueError("shape")
        if not isinstance(body["symbol"], str) or not SYMBOL.fullmatch(body["symbol"]):
            raise ValueError("symbol")
        return (body["symbol"],)
    if not isinstance(body, dict) or set(body) != {"symbols", "sector"}:
        raise ValueError("shape")
    symbols, sector = body["symbols"], body["sector"]
    if not isinstance(symbols, list) or not 1 <= len(symbols) <= MAX_COMPANIES:
        raise ValueError("count")
    if any(not isinstance(s, str) or not SYMBOL.fullmatch(s) for s in symbols):
        raise ValueError("symbol")
    if len({s.replace(".T", "") for s in symbols}) != len(symbols):
        raise ValueError("duplicate")
    if sector is not None and (not isinstance(sector, str) or not SECTOR.fullmatch(sector)):
        raise ValueError("sector")
    return symbols, sector


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
                self.reply(200, {"liveEnabled": bool(api_key), "requestToken": token,
                                 "maxCompanies": MAX_COMPANIES})
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
            if self.path not in ("/api/peers", "/api/compare"):
                self.reply(404, {"error": "not_found"})
                return
            if not api_key:
                self.reply(403, {"error": "setup_required"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY or self.headers.get("Content-Type") != "application/json":
                    raise ValueError()
                args = parse_body(self.path, json.loads(self.rfile.read(length)))
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "invalid_request"})
                return
            # One live action at a time; a second click while busy makes no request.
            if not gate.acquire(blocking=False):
                self.reply(429, {"error": "busy"})
                return
            try:
                if self.path == "/api/peers":
                    result = fetch_peers(args[0], api_key, requester)
                else:
                    result = fetch_bundle(args[0], api_key, requester, sector=args[1])
                self.reply(200, result)
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
        print("Fictional demo ready. Live access: %s. Ctrl+C to stop." % ("enabled; fetches require a click" if key else "disabled"), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
