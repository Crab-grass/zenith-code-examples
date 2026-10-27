"""Local examples for ZENITH Code. Python 3.9+, standard library only."""
import argparse
import csv
import getpass
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE_URL = "https://api.zenithcode.net/stable"
MODES = ("snapshot", "history", "financials", "full", "trend", "compare", "search", "statements")
DEMO_MODES = ("search", "trend", "compare", "statements")
DEMO_FILE = Path(__file__).resolve().parents[1] / "learning" / "demo-api.json"
SYMBOL = re.compile(r"[0-9A-Z]{4,5}(?:\.T)?")
CSV_FIELDS = ("symbol", "fiscalPeriod", "period", "accountingStandard", "fiscalPeriodDays",
              "revenue", "operatingIncome", "calculatedMargin", "apiMargin", "marginCheck",
              "source", "docId")


class ZenithError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward an API key to a redirect destination.


def request_rows(path, params, api_key, opener=None):
    if not api_key or not api_key.strip():
        raise ZenithError("Set ZENITH_API_KEY or enter your key when prompted.")
    url = BASE_URL + path + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "x-api-key": api_key.strip(), "Accept": "application/json",
        "User-Agent": "zenith-code-examples/1.0",
    })
    opener = opener or urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        hints = {
            401: "Check your API key.",
            403: "Check account permissions, key status and accepted data terms.",
            404: "Check the symbol and available coverage.",
            429: "Rate or quota limit reached. Check your dashboard before retrying.",
        }
        raise ZenithError("HTTP %s. %s" % (
            error.code, hints.get(error.code, "Check the API documentation; do not retry in a loop.")
        )) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ZenithError("Network request failed or timed out.") from None
    except (ValueError, UnicodeError):
        raise ZenithError("The API did not return valid JSON.") from None
    if not isinstance(data, list) or any(not isinstance(row, dict) for row in data):
        raise ZenithError("Unexpected response: expected an array of objects.")
    return data


def demo_requester(path, params, api_key=None):
    """Answer like the API from synthetic data. No network and no key."""
    data = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
    if path == "/search-name":
        query = params["query"].casefold()
        hits = [h for h in data[path] if query in h["nameEn"].casefold() or query in h["nameJa"].casefold()]
        return hits[:params["limit"]]
    if path not in data:
        raise ZenithError("Demo data covers %s only." % ", ".join(DEMO_MODES))
    return data[path].get(params["symbol"], [])[:params["limit"]]


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def margin_rows(rows):
    """Oldest first, with operating income / revenue recalculated from yen amounts.

    Missing values stay None: they are never replaced with 0. The API ratio is
    compared, not overwritten, so a mismatch remains visible.
    """
    result = []
    for row in sorted(rows, key=lambda r: str(r.get("fiscalPeriod") or "")):
        revenue, income, api = row.get("revenue"), row.get("operatingIncome"), row.get("operatingMargin")
        ratio = income / revenue if _number(revenue) and _number(income) and revenue > 0 else None
        if ratio is None:
            check = "notCalculated"
        elif api is None:
            check = "apiMissing"
        elif not _number(api):
            check = "apiInvalid"
        else:
            check = "match" if math.isclose(ratio, api, rel_tol=1e-9, abs_tol=1e-12) else "mismatch"
        provenance = row.get("provenance") if isinstance(row.get("provenance"), dict) else {}
        result.append({
            "symbol": row.get("symbol"), "fiscalPeriod": row.get("fiscalPeriod"),
            "period": row.get("period"), "accountingStandard": row.get("accountingStandard"),
            "fiscalPeriodDays": row.get("fiscalPeriodDays"),
            "revenue": revenue, "operatingIncome": income,
            "calculatedMargin": ratio, "apiMargin": api, "marginCheck": check,
            "source": provenance.get("source"), "docId": provenance.get("docId"),
        })
    return result


def comparison_notes(companies):
    """Explain why rows may not be comparable instead of silently pairing them."""
    periods = [{r["fiscalPeriod"] for r in rows} for rows in companies.values()]
    common = sorted(set.intersection(*periods)) if periods else []
    notes = []
    if not common:
        notes.append("No fiscal period is shared by every company. Fiscal year ends may differ; "
                     "state your own pairing rule before comparing.")
    for period in common:
        rows = [r for company in companies.values() for r in company if r["fiscalPeriod"] == period]
        standards = {str(r["accountingStandard"]).upper() for r in rows}
        if len(standards) > 1:
            notes.append("%s: accounting standards differ (%s)." % (period, ", ".join(sorted(standards))))
        days = [r["fiscalPeriodDays"] for r in rows if _number(r["fiscalPeriodDays"])]
        if days and max(days) - min(days) > 7:
            notes.append("%s: period lengths differ (%s days); check for an irregular fiscal year."
                         % (period, "/".join(str(int(d)) for d in days)))
        if any(r["calculatedMargin"] is None for r in rows):
            notes.append("%s: at least one margin could not be calculated from the amounts." % period)
    return common, notes


def run_example(mode, symbol, api_key, start=None, end=None, requester=request_rows,
                symbols=None, years=5, query=None):
    if mode not in MODES:
        raise ZenithError("Choose " + ", ".join(MODES[:-1]) + " or " + MODES[-1] + ".")
    if mode == "search":
        query = (query or "").strip()
        if not 2 <= len(query) <= 100:
            raise ZenithError("Search requires --query with 2 to 100 characters, e.g. --query Toyota.")
        return {"query": query, "retrievedAt": datetime.now(timezone.utc).isoformat(),
                "companies": requester("/search-name", {"query": query, "limit": 10}, api_key)}
    if mode == "compare":
        codes = [code.strip() for code in (symbols or "").split(",") if code.strip()]
        if not 2 <= len(codes) <= 4 or len(set(codes)) != len(codes):
            raise ZenithError("Compare requires 2 to 4 different codes, e.g. --symbols 7203,7267.")
        if not all(SYMBOL.fullmatch(code) for code in codes):
            raise ZenithError("Use securities codes such as 7203 or 130A.")
        result = {"symbols": codes, "retrievedAt": datetime.now(timezone.utc).isoformat()}
        companies = {code: margin_rows(requester("/income-statement", {
            "symbol": code, "period": "annual", "limit": 3,
        }, api_key)) for code in codes}
        result["companies"] = companies
        result["commonFiscalPeriods"], result["notes"] = comparison_notes(companies)
        return result
    if not SYMBOL.fullmatch(symbol):
        raise ZenithError("Use a securities code such as 7203 or 130A.")
    result = {"symbol": symbol, "retrievedAt": datetime.now(timezone.utc).isoformat()}
    if mode == "statements":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Statements --years must be between 1 and 10.")
        for key, path in (("incomeStatements", "/income-statement"),
                          ("balanceSheets", "/balance-sheet-statement"),
                          ("cashFlows", "/cash-flow-statement")):
            result[key] = requester(path, {"symbol": symbol, "period": "annual", "limit": years}, api_key)
    elif mode == "trend":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Trend --years must be between 1 and 10.")
        result["annualTrend"] = margin_rows(requester("/income-statement", {
            "symbol": symbol, "period": "annual", "limit": years,
        }, api_key))
    elif mode == "history":
        try:
            first, last = date.fromisoformat(start), date.fromisoformat(end)
        except (TypeError, ValueError):
            raise ZenithError("History requires --from and --to as YYYY-MM-DD.") from None
        if first > last or (last - first).days > 365:
            raise ZenithError("For this example, choose an ordered range of at most 365 days.")
        result["dailyPrices"] = requester("/historical-price-eod", {
            "symbol": symbol, "from": start, "to": end,
        }, api_key)
    elif mode == "full":
        result["asReportedStatements"] = requester("/financial-statement-full", {
            "symbol": symbol, "quarter": "FY",
        }, api_key)
    else:
        if mode == "snapshot":
            result["latestClose"] = requester("/quote", {"symbol": symbol}, api_key)
        result["annualFinancials"] = requester("/income-statement", {
            "symbol": symbol, "period": "annual", "limit": 3,
        }, api_key)
    return result


def table_rows(result):
    """Rows for --csv: trend and compare only. retrievedAt is kept on every row."""
    if "annualTrend" in result:
        rows = result["annualTrend"]
    elif "companies" in result:
        rows = [r for company in result["companies"].values() for r in company]
    else:
        raise ZenithError("--csv is available for trend and compare.")
    return [dict(r, retrievedAt=result["retrievedAt"]) for r in rows]


def write_csv(path, rows):
    # utf-8-sig lets spreadsheet software detect UTF-8. Empty cells mean missing, not zero.
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_FIELDS + ("retrievedAt",))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=MODES)
    parser.add_argument("--symbol", default="7203")
    parser.add_argument("--symbols", help="compare: 2-4 codes separated by commas")
    parser.add_argument("--query", help="search: part of a Japanese or English company name")
    parser.add_argument("--demo", action="store_true",
                        help="search/trend/compare/statements with synthetic data; no key or network")
    parser.add_argument("--years", type=int, help="trend (default 5) / statements (default 3): 1-10 fiscal years")
    parser.add_argument("--from", dest="start")
    parser.add_argument("--to", dest="end")
    parser.add_argument("--csv", help="trend/compare: also write a local CSV file")
    args = parser.parse_args()
    if args.csv and args.mode not in ("trend", "compare"):
        parser.error("--csv is available for trend and compare.")
    if args.demo and args.mode not in DEMO_MODES:
        parser.error("--demo is available for %s." % ", ".join(DEMO_MODES))
    if args.years is None:
        args.years = 3 if args.mode == "statements" else 5
    try:
        if args.demo:
            key, requester = "demo", demo_requester
            print("Demo mode: fictional companies and values. No API request is made.", file=sys.stderr)
        else:
            key, requester = os.environ.get("ZENITH_API_KEY", ""), request_rows
            if not key and sys.stdin.isatty():
                key = getpass.getpass("ZENITH API key (hidden): ")
            if not key.strip():
                raise ZenithError("Set ZENITH_API_KEY or run interactively to enter your key. "
                                  "To try without a key, add --demo.")
            print("Local/private use: do not publish API responses or API keys.", file=sys.stderr)
        data = run_example(args.mode, args.symbol, key, args.start, args.end, requester,
                           symbols=args.symbols, years=args.years, query=args.query)
        if args.demo:
            data["demo"] = True
        if args.csv:
            write_csv(args.csv, table_rows(data))
            print("Wrote %s. Keep it private." % args.csv, file=sys.stderr)
        print(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False))
    except ZenithError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
