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
import unicodedata
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
# Saved snapshots the reader can open without an API key (--demo). Only these names are accepted.
DEMOS = {"automakers": "demo.json", "suppliers": "demo-suppliers.json"}

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
LARGE = ("symbol", "holderName", "shares", "unit", "ratio", "submittedAt", "groupRatio", "isJointReport", "reportKind", "obligationDate")
CROSS_HOLDER = ("holder", "companyName")
CROSS_SUMMARY = ("holder", "purpose", "listing", "issues", "priorIssues")
CROSS_HOLDING = ("holder", "type", "row", "name", "shares", "priorShares", "issuerHoldsOwnShares")
FEE_PARTS = ("audit", "nonAudit", "networkAudit", "networkNonAudit")
FEE_SCOPE = ("reportingCompany", "consolidatedSubsidiaries", "total")
CUSTOMER = ("period", "customer", "revenue", "segment")
# Where the main-customers rows were read (the API's sourceTag). The notes often name a customer
# together with its group companies; the "sales by main customer" table names each company.
CUSTOMER_SOURCES = {
    "jpcrp_cor:InformationForEachOfMainCustomersTextBlock": "notes",
    "jpigp_cor:InformationAboutMajorCustomersIFRSTextBlock": "notes",
    "jpcrp_cor:NotesSegmentInformationEtcConsolidatedFinancialStatementsTextBlock": "notes",
    "jpcrp_cor:NotesSegmentInformationEtcFinancialStatementsTextBlock": "notes",
    "jpigp_cor:NotesSegmentInformationConsolidatedFinancialStatementsIFRSTextBlock": "notes",
    "jpigp_cor:NotesSegmentInformationFinancialStatementsIFRSTextBlock": "notes",
    "jpcrp_cor:ProductionOrdersReceivedAndSalesTextBlock": "sales",
    "jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock": "sales",
}
REVENUE = ("symbol", "fiscalPeriod", "period", "revenue")
# Treasury shares (voting-rights section): holder rows without addresses, issued shares per class and
# the earnings-release counts (numbers only; the release itself is never linked).
TREASURY_VALUES = ("ownName", "othersNames", "total", "ratio")
TREASURY_HOLDER = ("row", "name") + TREASURY_VALUES
ISSUED = ("atFiscalYearEnd", "atFilingDate")
RELEASE = ("fiscalPeriod", "issuedShares", "treasuryShares")
PERIOD = re.compile(r"[0-9]{4}-(?:0[1-9]|1[0-2])")
# Extraordinary reports (臨時報告書): one row per filing. The reason text is cut to its first sentence
# (at most EXCERPT characters) and dropped for changes of representative directors or major
# shareholders and whenever it reads like a personal record (a date of birth or a career summary); `sections` (the counterparty summaries of a merger or split) are never passed on.
EXTRAORDINARY = ("symbol", "docTypeCode", "submittedAt")
REASON = ("key", "label")
REASON_TYPE = ("key", "labelJa", "labelEn", "category")
EXTRAORDINARY_LIMIT = 50  # the newest 50 per company (the API allows up to 100)
EXCERPT = 120
# Reasons whose text is about people (who became or stopped being a representative director or a
# major shareholder): even the first sentence can carry a name, so no excerpt is passed on.
PERSONAL_REASONS = {"representative_change", "major_shareholder_change"}
PERSONAL = re.compile(r"[0-9]{1,4}\s*年\s*[0-9]{1,2}\s*月\s*[0-9]{1,2}\s*日\s*生|生年月日|略歴")
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
    out["customerSource"] = CUSTOMER_SOURCES.get(row.get("sourceTag"))  # "notes", "sales" or None
    customers = []
    for c in _list(row.get("customers") or [], 60):
        item = _pick(c, CUSTOMER)
        # Why a row has no customer name ("not named in the filing", "combined amount of 2 groups").
        notes = c.get("notes")
        item["notes"] = [n[:200] for n in notes[:3] if isinstance(n, str)] if isinstance(notes, list) else []
        customers.append(item)
    out["customers"] = customers
    return out


def clean_treasury(rows, expected, period=None):
    """The treasury-shares table of one annual report. With `period`, only a report for that fiscal period."""
    if not rows:
        return None
    rows = _list(rows, 10)
    for row in rows:
        _check_symbol(row, expected)
    if period is not None:
        rows = [r for r in rows if r.get("fiscalPeriod") == period]
    row = _latest(rows)
    if row is None:
        return None
    out = _document(row)
    table = row.get("votingRightsTable") if isinstance(row.get("votingRightsTable"), dict) else {}
    total = table.get("total")
    out["votingRightsTable"] = {
        "total": _pick(total, TREASURY_VALUES) if isinstance(total, dict) else None,
        "holders": [_pick(h, TREASURY_HOLDER) for h in _list(table.get("holders") or [], 60)],  # addresses are never copied
    }
    issued = []
    for item in _list(row.get("issuedShares") or [], 10):
        members = item.get("members") if isinstance(item, dict) else None
        entry = _pick(item, ISSUED)
        entry["members"] = [str(m)[:100] for m in members[:5]] if isinstance(members, list) else []
        issued.append(entry)
    out["issuedShares"] = issued
    release = row.get("consolidated")
    out["consolidated"] = _pick(release, RELEASE) if isinstance(release, dict) else None
    return out


def previous_year(period):
    """The same month a year earlier: 2026-03 -> 2025-03."""
    if not isinstance(period, str) or not PERIOD.fullmatch(period):
        return None
    return "%04d-%s" % (int(period[:4]) - 1, period[5:])


def first_sentence(text):
    """Text up to the first 。 outside brackets: filings put 。 inside (以下「…」といいます。)."""
    depth = 0
    for i, ch in enumerate(text):
        if ch in "(「『":
            depth += 1
        elif ch in ")」』":
            depth = max(0, depth - 1)
        elif ch == "。" and depth == 0:
            return text[:i + 1]
    return text


def excerpt(text):
    """The first sentence of a report's reason text, at most EXCERPT characters; None for personal records."""
    if not isinstance(text, str):
        return None
    first = first_sentence(unicodedata.normalize("NFKC", text).strip())
    if not first or PERSONAL.search(first):
        return None
    return first if len(first) <= EXCERPT else first[:EXCERPT - 1] + "…"


def clean_extraordinary(rows, expected):
    """Extraordinary reports of one company, newest first. A 404 and an empty list both mean none."""
    out = []
    for row in _list(rows or [], EXTRAORDINARY_LIMIT):
        _check_symbol(row, expected)
        item = _document(row, EXTRAORDINARY)
        item["reasons"] = [_pick(r, REASON) for r in _list(row.get("reasons") or [], 10)]
        personal = any(r["key"] in PERSONAL_REASONS for r in item["reasons"])
        item["excerpt"] = None if personal else excerpt(row.get("reasonText"))
        out.append(item)  # reasonText in full and sections are never copied.
    return sorted(out, key=lambda r: str(r.get("submittedAt") or ""), reverse=True)


def clean_reason_types(rows):
    """The reason list (key, names and category), used to classify each report's reasons."""
    return {r["key"]: r for r in (_pick(row, REASON_TYPE) for row in _list(rows or [], 200)) if isinstance(r["key"], str)}


def classify(companies, types):
    """Adds the English name and the category from the reason list; unknown keys get neither."""
    for company in companies:
        for report in company["extraordinaryReports"]:
            for reason in report["reasons"]:
                known = types.get(reason["key"]) or {}
                reason["labelEn"] = known.get("labelEn")
                reason["category"] = known.get("category")


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
    """One company, whitelisted. 15 requests, 16 when main customers exist (revenue is then fetched).

    Treasury shares are fetched twice: the latest annual report, then the one a year earlier
    (no second request when the first is a 404). Extraordinary reports are one request (the newest 50)."""
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
    treasury = clean_treasury(optional(requester, "/treasury-shares", {"symbol": symbol}, api_key), symbol)
    company["treasuryShares"] = treasury
    company["priorTreasuryShares"] = None
    prior = previous_year(treasury["fiscalPeriod"]) if treasury else None
    if prior:
        company["priorTreasuryShares"] = clean_treasury(
            optional(requester, "/treasury-shares", {"symbol": symbol, "fiscalPeriod": prior}, api_key), symbol, prior)
    company["extraordinaryReports"] = clean_extraordinary(optional(requester, "/extraordinary-reports", {
        "symbol": symbol, "limit": EXTRAORDINARY_LIMIT}, api_key), symbol)
    return company


def fetch_bundle(symbols, api_key, requester=request_rows):
    """The comparison exactly as the browser receives it (and as build_demo.py saves it).

    Strictly sequential; the first failure other than a 404 aborts everything (no partial result,
    no retry). The reason list of extraordinary reports is one more request per fetch.
    """
    companies = [fetch_company(symbol, api_key, requester) for symbol in symbols]
    classify(companies, clean_reason_types(requester("/extraordinary-report-reasons", {}, api_key)))
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


def make_server(port=8790, api_key="", requester=request_rows, demo_set="automakers"):
    token = secrets.token_urlsafe(32)
    gate = threading.Lock()
    demo = json.loads((ROOT / DEMOS[demo_set]).read_text(encoding="utf-8"))

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
    parser.add_argument("--demo", choices=sorted(DEMOS), default="automakers",
                        help="Saved snapshot to open: automakers (demo.json) or suppliers (demo-suppliers.json)")
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
    with make_server(args.port, key, demo_set=args.demo) as server:
        print("Open http://127.0.0.1:%d" % server.server_port, flush=True)
        print("Saved snapshot: %s (%s). Live access: %s. Ctrl+C to stop." % (args.demo, DEMOS[args.demo],
            "enabled; each fetch makes 15-16 requests per company plus 1 and requires a click" if key else "disabled"), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
