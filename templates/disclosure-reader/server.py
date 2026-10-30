#!/usr/bin/env python3
"""Private, loopback-only disclosure reader for 2-5 companies. Python 3.9+, no packages."""
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
          "/model.mjs": ("model.mjs", "text/javascript"), "/i18n.mjs": ("i18n.mjs", "text/javascript"),
          "/style.css": ("style.css", "text/css")}
SYMBOL = re.compile(r"[0-9A-Z]{4,5}(?:\.T)?")
EDINET_DOC = re.compile(r"S[0-9A-Z]{7}")
MIN_COMPANIES, MAX_COMPANIES = 2, 5
MAX_BODY = 512
# The five annual-report sections the reader compares (text-blocks `tag` aliases).
SECTIONS = ("risks", "policy", "rnd", "capex", "audits")
MAX_CONTENT = 120000  # characters per section; longer text is cut and flagged

# Whitelists: anything not listed never reaches the browser or demo.json. Left out on purpose:
#   - prices and price-derived values (/profile returns price, marketCap, PER, PBR, ...);
#   - carryingAmount / priorCarryingAmount of cross-shareholdings (listed shares are carried at
#     market value, so the amounts are price-derived);
#   - archiveUrl and any non-EDINET link (TDnet documents);
#   - income-statement fields other than revenue and its period.
DOC = ("symbol", "fiscalPeriod", "period", "docTypeCode", "submittedAt")
PROFILE = ("symbol", "nameJa", "nameEn", "isEtf", "assetType")
TEXT = DOC + ("tag", "labelJa", "label", "contentFormat")
MAJOR = ("symbol", "fiscalPeriod", "rank", "holderName", "shares", "unit", "ratio")
CATEGORY = ("category", "labelJa", "labelEn", "shareholders", "units", "ratio")
LARGE = ("symbol", "holderName", "shares", "unit", "ratio", "submittedAt")
CROSS_HOLDER = ("holder", "companyName")
CROSS_SUMMARY = ("holder", "purpose", "listing", "issues", "priorIssues")
CROSS_HOLDING = ("holder", "type", "row", "name", "shares", "priorShares", "issuerHoldsOwnShares")
FEE_PARTS = ("audit", "nonAudit", "networkAudit", "networkNonAudit")
FEE_SCOPE = ("reportingCompany", "consolidatedSubsidiaries", "total")
CUSTOMER = ("period", "customer", "revenue", "segment")
REVENUE = ("symbol", "fiscalPeriod", "period", "revenue")
PREFECTURE = re.compile(r"^(北海道|東京都|京都府|大阪府|[^\s都道府県]{2,3}県)")


def _scalar(value, limit=300):
    # Plain JSON scalars only; nested values are projected explicitly or dropped.
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value[:limit]
    return None


def _pick(row, fields):
    if not isinstance(row, dict):
        raise ValueError("row")
    return {field: _scalar(row.get(field)) for field in fields}


def edinet_url(value):
    """Only EDINET viewer pages are passed on. TDnet and archive links are dropped."""
    if not isinstance(value, str):
        return None
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if parts.scheme == "https" and (host == "edinet-fsa.go.jp" or host.endswith(".edinet-fsa.go.jp")):
        return value[:300]
    return None


def _document(row, fields=DOC):
    out = _pick(row, fields)
    doc = row.get("docId")
    out["docId"] = doc if isinstance(doc, str) and EDINET_DOC.fullmatch(doc) else None
    out["sourceUrl"] = edinet_url(row.get("sourceUrl"))
    return out


def _same(symbol, expected):
    return isinstance(symbol, str) and symbol.replace(".T", "") == expected.replace(".T", "")


def _check_symbol(row, expected):
    if not _same(row.get("symbol"), expected):
        raise ValueError("symbol")


def _list(value, limit):
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError("rows")
    return value


def region(address):
    """Prefecture for Japanese addresses, "overseas" for others. Street addresses are not passed on."""
    if not isinstance(address, str) or not address.strip():
        return None
    match = PREFECTURE.match(address.strip())
    return match.group(1) if match else "overseas"


def _latest(rows):
    return max(rows, key=lambda r: (str(r.get("fiscalPeriod") or ""), str(r.get("submittedAt") or ""))) if rows else None


def clean_profile(rows, expected):
    rows = _list(rows, 5)
    match = next((r for r in rows if isinstance(r, dict) and _same(r.get("symbol"), expected)), None)
    if match is None:
        raise ValueError("profile")
    return _pick(match, PROFILE)


def clean_text(rows, expected):
    if rows is None:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    row = _latest(rows)
    if row is None:
        return None
    out = _document(row, TEXT)
    content = row.get("content")
    content = content if isinstance(content, str) else ""
    # The template counts characters of the text it receives, not the API's `chars` (HTML size).
    out["content"] = content[:MAX_CONTENT]
    out["truncated"] = len(content) > MAX_CONTENT
    return out


def clean_major(rows, expected):
    out = []
    for row in _list(rows or [], 40):
        _check_symbol(row, expected)
        item = _pick(row, MAJOR)
        item["region"] = region(row.get("address"))
        item.update(_document(row, ()))
        out.append(item)
    return out


def clean_categories(rows, expected):
    if not rows:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    row = _latest(rows)
    out = _document(row)
    classes = _list(row.get("classes") or [], 10)
    # Ordinary shares only; class or preferred shares are a separate register.
    chosen = next((c for c in classes if isinstance(c, dict) and any("OrdinaryShare" in str(m) for m in c.get("members") or [])),
                  classes[0] if classes else None)
    out["categories"] = [_pick(c, CATEGORY) for c in _list(chosen.get("categories") or [], 20)] if isinstance(chosen, dict) else []
    return out


def clean_large(rows, expected):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    for row in rows:
        _check_symbol(row, expected)
    # Long filing histories are cut to the 60 most recent reports; the view shows 5.
    rows = sorted(rows, key=lambda r: str(r.get("submittedAt") or ""), reverse=True)[:60]
    out = []
    for row in rows:
        item = _pick(row, LARGE)
        item.update(_document(row, ()))
        out.append(item)  # archiveUrl is never copied.
    return out


def clean_cross(rows, expected):
    if not rows:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    row = _latest(rows)
    out = _document(row)
    out["holders"] = [_pick(h, CROSS_HOLDER) for h in _list(row.get("holders") or [], 10)]
    out["summary"] = [_pick(s, CROSS_SUMMARY) for s in _list(row.get("summary") or [], 20)]
    holdings = []
    for h in _list(row.get("holdings") or [], 600):
        item = _pick(h, CROSS_HOLDING)
        item["rationale"] = _scalar(h.get("rationale") if isinstance(h, dict) else None, 1200)
        holdings.append(item)  # carryingAmount and priorCarryingAmount are never copied.
    out["holdings"] = holdings
    return out


def clean_audit(rows, expected):
    if not rows:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    row = _latest(rows)
    out = _document(row)
    fees = []
    for fee in _list(row.get("fees") or [], 4):
        if not isinstance(fee, dict):
            raise ValueError("fee")
        item = {"period": _scalar(fee.get("period")), "nonAuditRatio": _scalar(fee.get("nonAuditRatio"))}
        for part in FEE_PARTS:
            item[part] = _pick(fee[part], FEE_SCOPE) if isinstance(fee.get(part), dict) else None
        fees.append(item)
    out["fees"] = fees
    return out


def clean_customers(rows, expected):
    if not rows:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    row = _latest(rows)
    out = _document(row)
    out["customers"] = [_pick(c, CUSTOMER) for c in _list(row.get("customers") or [], 60)]
    return out


def clean_revenue(rows, expected):
    out = []
    for row in _list(rows or [], 5):
        _check_symbol(row, expected)
        out.append(_pick(row, REVENUE))  # Revenue and its period only.
    return out


def optional(requester, path, params, api_key):
    """None when the API answers 404 (the disclosure does not exist); every other error aborts."""
    try:
        return requester(path, params, api_key)
    except ZenithError as error:
        if str(error).startswith("HTTP 404."):
            return None
        raise


def fetch_company(symbol, api_key, requester=request_rows):
    """One company, whitelisted. 12 requests, 13 when main customers exist (revenue is then fetched)."""
    company = {"symbol": symbol}
    company["profile"] = clean_profile(requester("/profile", {"symbol": symbol}, api_key), symbol)
    company["texts"] = {tag: clean_text(optional(requester, "/text-blocks", {"symbol": symbol, "tag": tag}, api_key), symbol)
                        for tag in SECTIONS}
    company["majorShareholders"] = clean_major(optional(requester, "/major-shareholders", {"symbol": symbol}, api_key), symbol)
    company["shareholderCategories"] = clean_categories(
        optional(requester, "/shareholder-categories", {"symbol": symbol}, api_key), symbol)
    company["largeHolders"] = clean_large(optional(requester, "/large-holders", {"symbol": symbol}, api_key), symbol)
    company["crossShareholdings"] = clean_cross(optional(requester, "/cross-shareholdings", {"symbol": symbol}, api_key), symbol)
    company["auditFees"] = clean_audit(optional(requester, "/audit-fees", {"symbol": symbol}, api_key), symbol)
    company["mainCustomers"] = clean_customers(optional(requester, "/main-customers", {"symbol": symbol}, api_key), symbol)
    company["revenue"] = []
    if company["mainCustomers"] and company["mainCustomers"]["customers"]:
        # Only needed to express each customer as a share of annual revenue.
        company["revenue"] = clean_revenue(requester("/income-statement", {
            "symbol": symbol, "period": "annual", "limit": 3}, api_key), symbol)
    return company


def fetch_bundle(symbols, api_key, requester=request_rows):
    """The comparison exactly as the browser receives it (and as build_demo.py saves it).

    Strictly sequential; the first failure other than a 404 aborts everything (no partial result,
    no retry).
    """
    companies = [fetch_company(symbol, api_key, requester) for symbol in symbols]
    return {"mode": "live", "retrievedAt": _now(), "companies": companies}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_body(body):
    """Return the validated codes or raise ValueError. Nothing is fetched before this passes."""
    if not isinstance(body, dict) or set(body) != {"symbols"}:
        raise ValueError("shape")
    symbols = body["symbols"]
    if not isinstance(symbols, list) or not MIN_COMPANIES <= len(symbols) <= MAX_COMPANIES:
        raise ValueError("count")
    if any(not isinstance(s, str) or not SYMBOL.fullmatch(s) for s in symbols):
        raise ValueError("symbol")
    if len({s.replace(".T", "") for s in symbols}) != len(symbols):
        raise ValueError("duplicate")
    return symbols


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
                                 "minCompanies": MIN_COMPANIES, "maxCompanies": MAX_COMPANIES})
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
            if self.path != "/api/compare":
                self.reply(404, {"error": "not_found"})
                return
            if not api_key:
                self.reply(403, {"error": "setup_required"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY or self.headers.get("Content-Type") != "application/json":
                    raise ValueError()
                symbols = parse_body(json.loads(self.rfile.read(length)))
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "invalid_request"})
                return
            # One live action at a time; a second click while busy makes no request.
            if not gate.acquire(blocking=False):
                self.reply(429, {"error": "busy"})
                return
            try:
                self.reply(200, fetch_bundle(symbols, api_key, requester))
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
        print("Saved snapshot ready. Live access: %s. Ctrl+C to stop." % (
            "enabled; each fetch makes 12-13 requests per company and requires a click" if key else "disabled"), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
