"""Local examples for ZENITH Code. Python 3.9+, standard library only."""
import argparse
import csv
import getpass
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE_URL = "https://api.zenithcode.net/stable"
MODES = ("snapshot", "history", "financials", "full", "trend", "compare", "search", "statements",
         "metrics", "peers", "dividends", "earnings", "quarters", "health", "benchmark")
DEMO_MODES = ("search", "trend", "compare", "statements", "metrics", "peers", "dividends", "earnings", "quarters",
              "health", "benchmark")
CSV_MODES = ("trend", "compare", "statements", "metrics", "peers", "dividends", "earnings", "quarters",
             "health", "benchmark")
DEFAULT_LIMITS = {"peers": 10, "dividends": 40, "earnings": 200}
DEMO_FILE = Path(__file__).resolve().parents[1] / "learning" / "demo-api.json"
SYMBOL = re.compile(r"[0-9A-Z]{4,5}(?:\.T)?")
CSV_FIELDS = ("symbol", "fiscalPeriod", "period", "accountingStandard", "fiscalPeriodDays",
              "revenue", "operatingIncome", "calculatedMargin", "apiMargin", "marginCheck",
              "source", "docId")
METRIC_FIELDS = ("symbol", "fiscalPeriod", "period", "accountingStandard", "roe", "roa", "roic",
                 "operatingMargin", "netMargin", "equityRatio", "financialLeverage", "payoutRatio",
                 "eps", "bps", "dividendPerShare", "freeCashFlow", "interestBearingDebt",
                 "priceDate", "closePrice", "per", "pbr", "dividendYield", "source", "docId")
PEER_FIELDS = ("role", "symbol", "nameEn", "nameJa", "sector", "marketCap", "per", "pbr", "psr",
               "evToEbitda", "roe", "roa", "dividendYield", "changePctYtd", "marketCapRank", "sectorCount")
DIVIDEND_FIELDS = ("symbol", "periodEndDate", "periodType", "dividendType", "forecastOrActual", "amount",
                   "rawAmount", "exDividendDate", "paymentDate", "announcementDate", "dataSource")
EARNINGS_FIELDS = ("symbol", "reportDate", "fiscalDate", "beforeAfterMarket", "actualEps", "estimateEps",
                   "surpriseRate")
QUARTER_ITEMS = ("revenue", "operatingIncome", "netIncome")
QUARTER_FIELDS = ("symbol", "fiscalYearEnd", "quarter", "quarterEnd", "accountingStandard",
                  "revenue", "operatingIncome", "netIncome", "operatingMargin",
                  "cumulativeRevenue", "cumulativeOperatingIncome", "cumulativeNetIncome",
                  "status", "docId", "previousDocId")
HEALTH_FIELDS = ("symbol", "fiscalPeriod", "accountingStandard", "totalAssets", "ownersEquity", "equityRatio",
                 "apiEquityRatio", "equityRatioCheck", "currentRatio", "interestBearingDebt",
                 "netInterestBearingDebt", "debtToEquity", "cashAndCashEquivalents", "operatingCashFlow",
                 "investingCashFlow", "freeCashFlow", "flags", "balanceSheetDocId", "cashFlowDocId")
# (metric, where the company value comes from, outlier rule used by /industry-benchmarks)
BENCHMARK_METRICS = (("per", "profile", lambda v: v <= 0), ("pbr", "profile", lambda v: v <= 0),
                     ("dividendYield", "profile", lambda v: v <= 0 or v > 1),
                     ("marketCap", "profile", lambda v: v <= 0),
                     ("roe", "keyMetrics", lambda v: v > 1), ("roa", "keyMetrics", lambda v: v > 1),
                     ("revenueCagr3y", "keyMetricsLatest", lambda v: False),
                     ("epsCagr3y", "keyMetricsLatest", lambda v: False))
BENCHMARK_FIELDS = ("symbol", "sector", "metric", "value", "basis", "sectorQ1", "sectorMedian", "sectorQ3",
                    "sectorCount", "position")
STATEMENTS = (("incomeStatements", "/income-statement"),
              ("balanceSheets", "/balance-sheet-statement"),
              ("cashFlows", "/cash-flow-statement"))
ROW_META = {"symbol", "fiscalPeriod", "period", "accountingStandard", "updatedAt", "provenance", "fiscalPeriodDays"}


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


def cache_key(path, params):
    """Same string in Python and JavaScript, so both can share one cache folder."""
    query = urllib.parse.urlencode(sorted((k, str(v)) for k, v in params.items()))
    return hashlib.sha256((path + "?" + query).encode("utf-8")).hexdigest()


def cached(requester, folder, ttl_hours=24, stats=None):
    """Reuse saved responses for identical requests to save quota.

    The API key is not part of the key or the file. Errors are never cached.
    Files contain API data: keep the folder private (output/ is ignored by Git).
    """
    stats = stats if stats is not None else {}

    def get(path, params, api_key):
        file = os.path.join(folder, cache_key(path, params) + ".json")
        try:
            with open(file, encoding="utf-8") as saved_file:
                saved = json.load(saved_file)
            if saved["path"] == path and time.time() - saved["savedAt"] < ttl_hours * 3600:
                stats["reused"] = stats.get("reused", 0) + 1
                return saved["rows"]
        except (OSError, ValueError, KeyError, TypeError):
            pass
        rows = requester(path, params, api_key)
        os.makedirs(folder, exist_ok=True)
        with open(file, "w", encoding="utf-8") as saved_file:
            json.dump({"path": path, "params": params, "savedAt": time.time(), "rows": rows},
                      saved_file, ensure_ascii=False)
        stats["requested"] = stats.get("requested", 0) + 1
        return rows
    return get


def demo_requester(path, params, api_key=None):
    """Answer like the API from synthetic data. No network and no key."""
    data = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
    if path == "/search-name":
        query = params["query"].casefold()
        hits = [h for h in data[path] if query in h["nameEn"].casefold() or query in h["nameJa"].casefold()]
        return hits[:params["limit"]]
    if path not in data:
        raise ZenithError("Demo data covers %s only." % ", ".join(DEMO_MODES))
    if path == "/earnings-calendar":
        rows = [r for r in data[path] if (not params.get("from") or r["reportDate"] >= params["from"])
                and (not params.get("to") or r["reportDate"] <= params["to"])]
        return rows[:params["limit"]]
    if path == "/industry-benchmarks":
        return data[path].get(params.get("sector", "ALL"), [])
    if path == "/peers":
        rows = data[path].get(params["symbol"], [])
        return rows[:1 + params["limit"]] + rows[-1:] if len(rows) > params["limit"] + 2 else rows
    rows = data[path].get(params["symbol"], [])
    if params.get("period") == "annual":
        rows = [r for r in rows if r.get("period") == "FY"]
    elif params.get("period") == "quarter":
        rows = [r for r in rows if str(r.get("period", "")).startswith("Q")]
    return rows[:params.get("limit", len(rows))]


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


def _add_months(period, months):
    year, month = (int(part) for part in period.split("-"))
    total = year * 12 + month - 1 + months
    return "%04d-%02d" % (total // 12, total % 12 + 1)


def standalone_quarters(rows):
    """Turn Japanese year-to-date figures into standalone quarters.

    Q2 and Q3 income-statement rows are cumulative from the start of the fiscal
    year, and FY is the full year, so Q2 = cum Q2 - cum Q1 ... Q4 = FY - cum Q3.
    A value is derived only when both rows exist, belong to the same fiscal year
    and accounting standard, and cover about 3, 6, 9 or 12 months. Otherwise it
    stays None and `status` says why; nothing is estimated or filled with zero.
    """
    years = {}
    for row in rows:
        period, kind = row.get("fiscalPeriod"), row.get("period")
        if not period or kind not in ("Q1", "Q2", "Q3", "FY"):
            continue
        n = 4 if kind == "FY" else int(kind[1])
        years.setdefault(_add_months(period, 3 * (4 - n)), {})[n] = row
    result = []
    for year_end in sorted(years):
        quarters = years[year_end]
        for n in range(1, 5):
            row = quarters.get(n)
            if row is None:
                continue
            previous = quarters.get(n - 1)
            days = row.get("fiscalPeriodDays")
            status = "ok"
            if _number(days) and abs(days - 91.3 * n) > 20:
                status = "irregularPeriod"
            elif n > 1 and previous is None:
                status = "missingPrevious"
            elif n > 1 and str(previous.get("accountingStandard")).lower() != str(row.get("accountingStandard")).lower():
                status = "standardChanged"
            out = {"symbol": row.get("symbol"), "fiscalYearEnd": year_end, "quarter": "Q%d" % n,
                   "quarterEnd": row.get("fiscalPeriod"), "accountingStandard": row.get("accountingStandard")}
            for item in QUARTER_ITEMS:
                current = row.get(item)
                out["cumulative" + item[0].upper() + item[1:]] = current
                if status != "ok" or not _number(current):
                    out[item] = None
                elif n == 1:
                    out[item] = current
                else:
                    before = previous.get(item)
                    out[item] = current - before if _number(before) else None
            if status == "ok" and any(out[item] is None for item in QUARTER_ITEMS):
                status = "missingValue"
            revenue, income = out["revenue"], out["operatingIncome"]
            out["operatingMargin"] = income / revenue if _number(revenue) and _number(income) and revenue > 0 else None
            out["status"] = status
            out["docId"] = (row.get("provenance") or {}).get("docId")
            out["previousDocId"] = (previous.get("provenance") or {}).get("docId") if n > 1 and previous else None
            result.append(out)
    return result


def _ratio(top, bottom):
    return top / bottom if _number(top) and _number(bottom) and bottom > 0 else None


def health_rows(balance_sheets, cash_flows):
    """Balance-sheet strength and cash generation by fiscal year, oldest first.

    Ratios are recalculated from yen amounts; the API equity ratio is compared,
    not overwritten. `flags` only describes the numbers (for example negative
    free cash flow); it is not a rating.
    """
    flows = {r.get("fiscalPeriod"): r for r in cash_flows}
    result = []
    for bs in sorted(balance_sheets, key=lambda r: str(r.get("fiscalPeriod") or "")):
        cf = flows.get(bs.get("fiscalPeriod"), {})
        equity, assets = bs.get("ownersEquity"), bs.get("totalAssets")
        ratio, api = _ratio(equity, assets), bs.get("equityRatio")
        if ratio is None or not _number(api):
            check = "notChecked"
        else:
            check = "match" if math.isclose(ratio, api, rel_tol=1e-6, abs_tol=1e-9) else "mismatch"
        ocf, icf = cf.get("operatingCashFlow"), cf.get("investingCashFlow")
        fcf = cf.get("freeCashFlow")
        if fcf is None and _number(ocf) and _number(icf):
            fcf = ocf + icf
        flags = []
        if _number(equity) and equity <= 0:
            flags.append("nonPositiveEquity")
        if _number(ocf) and ocf < 0:
            flags.append("negativeOperatingCashFlow")
        if _number(fcf) and fcf < 0:
            flags.append("negativeFreeCashFlow")
        if not cf:
            flags.append("cashFlowMissing")
        result.append({
            "symbol": bs.get("symbol"), "fiscalPeriod": bs.get("fiscalPeriod"),
            "accountingStandard": bs.get("accountingStandard"),
            "totalAssets": assets, "ownersEquity": equity, "equityRatio": ratio,
            "apiEquityRatio": api, "equityRatioCheck": check,
            "currentRatio": _ratio(bs.get("totalCurrentAssets"), bs.get("totalCurrentLiabilities")),
            "interestBearingDebt": bs.get("interestBearingDebt"),
            "netInterestBearingDebt": bs.get("netInterestBearingDebt"),
            "debtToEquity": _ratio(bs.get("interestBearingDebt"), equity),
            "cashAndCashEquivalents": bs.get("cashAndCashEquivalents"),
            "operatingCashFlow": ocf, "investingCashFlow": icf, "freeCashFlow": fcf,
            "flags": ";".join(flags),
            "balanceSheetDocId": (bs.get("provenance") or {}).get("docId"),
            "cashFlowDocId": (cf.get("provenance") or {}).get("docId"),
        })
    return result


def benchmark_rows(symbol, profile, key_metrics, latest, benchmarks):
    """Place the company within its TSE 33-sector quartiles, metric by metric."""
    sector = profile.get("sector")
    bench = next((b for b in benchmarks if b.get("sector") == sector), {})
    sources = {"profile": (profile, "price date %s" % profile.get("priceDate")),
               "keyMetrics": (key_metrics, "fiscal period %s" % key_metrics.get("fiscalPeriod")),
               "keyMetricsLatest": (latest, "latest annual, updated %s" % latest.get("updatedAt"))}
    rows = []
    for metric, source, outlier in BENCHMARK_METRICS:
        row, basis = sources[source]
        value = row.get(metric)
        q1, median, q3 = (bench.get(metric + part) for part in ("Q1", "Median", "Q3"))
        if not _number(value):
            position = "noValue"
        elif outlier(value):
            position = "excludedLikeBenchmark"  # the sector statistics drop such values too
        elif not all(_number(v) for v in (q1, median, q3)):
            position = "noBenchmark"
        elif value < q1:
            position = "belowQ1"
        elif value < median:
            position = "Q1toMedian"
        elif value <= q3:
            position = "medianToQ3"
        else:
            position = "aboveQ3"
        rows.append({"symbol": symbol, "sector": sector, "metric": metric, "value": value, "basis": basis,
                     "sectorQ1": q1, "sectorMedian": median, "sectorQ3": q3,
                     "sectorCount": bench.get(metric + "Count"), "position": position})
    return rows


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


def _date_range(start, end, max_days, label):
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except (TypeError, ValueError):
        raise ZenithError("%s requires --from and --to as YYYY-MM-DD." % label) from None
    if first > last or (last - first).days > max_days:
        raise ZenithError("For %s, choose an ordered range of at most %d days." % (label, max_days))


def _codes(symbols):
    codes = [code.strip() for code in (symbols or "").split(",") if code.strip()]
    if not all(SYMBOL.fullmatch(code) for code in codes):
        raise ZenithError("Use securities codes such as 7203 or 130A.")
    return codes


def run_example(mode, symbol, api_key, start=None, end=None, requester=request_rows,
                symbols=None, years=5, query=None, limit=None):
    if mode not in MODES:
        raise ZenithError("Choose " + ", ".join(MODES[:-1]) + " or " + MODES[-1] + ".")
    limit = DEFAULT_LIMITS.get(mode, 10) if limit is None else limit
    if mode == "earnings":
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ZenithError("Earnings --limit must be between 1 and 500.")
        params = {"limit": limit}
        if start or end:
            _date_range(start, end, 93, "earnings")
            params.update({"from": start, "to": end})
        codes = _codes(symbols)
        rows = requester("/earnings-calendar", params, api_key)
        return {"retrievedAt": datetime.now(timezone.utc).isoformat(), "symbols": codes or None,
                "earnings": [r for r in rows if not codes or r.get("symbol") in codes]}
    if mode == "search":
        query = (query or "").strip()
        if not 2 <= len(query) <= 100:
            raise ZenithError("Search requires --query with 2 to 100 characters, e.g. --query Toyota.")
        return {"query": query, "retrievedAt": datetime.now(timezone.utc).isoformat(),
                "companies": requester("/search-name", {"query": query, "limit": 10}, api_key)}
    if mode == "compare":
        codes = _codes(symbols)
        if not 2 <= len(codes) <= 4 or len(set(codes)) != len(codes):
            raise ZenithError("Compare requires 2 to 4 different codes, e.g. --symbols 7203,7267.")
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
        for key, path in STATEMENTS:
            result[key] = requester(path, {"symbol": symbol, "period": "annual", "limit": years}, api_key)
    elif mode == "metrics":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Metrics --years must be between 1 and 10.")
        result["annualMetrics"] = requester("/key-metrics", {
            "symbol": symbol, "period": "annual", "limit": years,
        }, api_key)
    elif mode == "peers":
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 30:
            raise ZenithError("Peers --limit must be between 1 and 30.")
        result["peers"] = requester("/peers", {"symbol": symbol, "limit": limit}, api_key)
    elif mode == "health":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Health --years must be between 1 and 10.")
        params = {"symbol": symbol, "period": "annual", "limit": years}
        result["health"] = health_rows(requester("/balance-sheet-statement", params, api_key),
                                       requester("/cash-flow-statement", params, api_key))
    elif mode == "benchmark":
        profile = (requester("/profile", {"symbol": symbol}, api_key) or [{}])[0]
        if not profile.get("sector"):
            raise ZenithError("No TSE sector for this code (for example an ETF); benchmark needs one.")
        key_metrics = (requester("/key-metrics", {"symbol": symbol, "period": "annual", "limit": 1}, api_key) or [{}])[0]
        latest = (requester("/key-metrics-latest", {"symbol": symbol}, api_key) or [{}])[0]
        benchmarks = requester("/industry-benchmarks", {"sector": profile["sector"]}, api_key)
        result.update({"sector": profile["sector"], "sectorName": next(
            (b.get("sectorEn") for b in benchmarks if b.get("sector") == profile["sector"]), None)})
        result["benchmark"] = benchmark_rows(symbol, profile, key_metrics, latest, benchmarks)
    elif mode == "quarters":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Quarters --years must be between 1 and 10.")
        # No period filter: Q1-Q3 (year-to-date) and FY rows are both needed.
        rows = requester("/income-statement", {"symbol": symbol, "limit": min(40, years * 4)}, api_key)
        result["quarters"] = standalone_quarters(rows)
    elif mode == "dividends":
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ZenithError("Dividends --limit must be between 1 and 100.")
        result["dividends"] = requester("/dividends", {"symbol": symbol, "limit": limit}, api_key)
    elif mode == "trend":
        if isinstance(years, bool) or not isinstance(years, int) or not 1 <= years <= 10:
            raise ZenithError("Trend --years must be between 1 and 10.")
        result["annualTrend"] = margin_rows(requester("/income-statement", {
            "symbol": symbol, "period": "annual", "limit": years,
        }, api_key))
    elif mode == "history":
        _date_range(start, end, 365, "history")
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


def _flatten(row, fields):
    provenance = row.get("provenance") if isinstance(row.get("provenance"), dict) else {}
    extra = {"source": provenance.get("source"), "docId": provenance.get("docId")}
    return {f: row.get(f, extra.get(f)) for f in fields}


def statements_table(result):
    """Wide table: one row per line item, one column per fiscal period (oldest first)."""
    periods = sorted({r.get("fiscalPeriod") for key, _ in STATEMENTS for r in result.get(key, [])
                      if r.get("fiscalPeriod")})
    rows = []
    for key, _ in STATEMENTS:
        by_period = {r.get("fiscalPeriod"): r for r in result.get(key, [])}
        items = []
        for r in result.get(key, []):
            items += [k for k in r if k not in ROW_META and k not in items]
        meta = [("accountingStandard", lambda r: r.get("accountingStandard")),
                ("docId", lambda r: (r.get("provenance") or {}).get("docId"))]
        for item, get in meta + [(i, (lambda name: lambda r: r.get(name))(i)) for i in items]:
            row = {"statement": key, "item": item}
            row.update({p: get(by_period[p]) if p in by_period else None for p in periods})
            rows.append(row)
    return ["statement", "item"] + periods, rows


def table_rows(result):
    """(fields, rows) for --csv. retrievedAt is kept on every row."""
    if "annualTrend" in result:
        fields, rows = CSV_FIELDS, result["annualTrend"]
    elif "earnings" in result:
        fields, rows = EARNINGS_FIELDS, result["earnings"]
    elif "health" in result:
        fields, rows = HEALTH_FIELDS, result["health"]
    elif "benchmark" in result:
        fields, rows = BENCHMARK_FIELDS, result["benchmark"]
    elif "quarters" in result:
        fields, rows = QUARTER_FIELDS, result["quarters"]
    elif "dividends" in result:
        fields, rows = DIVIDEND_FIELDS, result["dividends"]
    elif "companies" in result and "symbols" in result:
        fields, rows = CSV_FIELDS, [r for company in result["companies"].values() for r in company]
    elif "annualMetrics" in result:
        fields, rows = METRIC_FIELDS, [_flatten(r, METRIC_FIELDS) for r in result["annualMetrics"]]
    elif "peers" in result:
        fields, rows = PEER_FIELDS, [_flatten(r, PEER_FIELDS) for r in result["peers"]]
    elif "incomeStatements" in result:
        fields, rows = statements_table(result)
    else:
        raise ZenithError("--csv is available for %s." % ", ".join(CSV_MODES))
    fields = tuple(fields) + ("retrievedAt",)
    return fields, [dict({f: r.get(f) for f in fields[:-1]}, retrievedAt=result["retrievedAt"]) for r in rows]


def write_csv(path, fields, rows):
    # utf-8-sig lets spreadsheet software detect UTF-8. Empty cells mean missing, not zero.
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=MODES)
    parser.add_argument("--symbol", default="7203")
    parser.add_argument("--symbols", help="compare: 2-4 codes; earnings: optional filter (comma separated)")
    parser.add_argument("--query", help="search: part of a Japanese or English company name")
    parser.add_argument("--demo", action="store_true",
                        help="search/trend/compare/statements with synthetic data; no key or network")
    parser.add_argument("--years", type=int,
                        help="trend/metrics (default 5), statements (default 3): 1-10 fiscal years")
    parser.add_argument("--limit", type=int,
                        help="peers: 1-30 peers excluding target and median (default 10); "
                             "dividends: 1-100 (default 40); earnings: 1-500 (default 200)")
    parser.add_argument("--cache", metavar="DIR",
                        help="reuse identical responses saved in DIR, e.g. output/cache (saves quota)")
    parser.add_argument("--cache-hours", type=float, default=24, help="how long saved responses stay fresh")
    parser.add_argument("--from", dest="start")
    parser.add_argument("--to", dest="end")
    parser.add_argument("--csv", help="also write a local CSV file (%s)" % ", ".join(CSV_MODES))
    args = parser.parse_args()
    if args.csv and args.mode not in CSV_MODES:
        parser.error("--csv is available for %s." % ", ".join(CSV_MODES))
    if args.demo and args.mode not in DEMO_MODES:
        parser.error("--demo is available for %s." % ", ".join(DEMO_MODES))
    if args.years is None:
        args.years = {"statements": 3, "quarters": 2}.get(args.mode, 5)
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
        stats = {}
        if args.cache:
            requester = cached(requester, args.cache, args.cache_hours, stats)
        data = run_example(args.mode, args.symbol, key, args.start, args.end, requester,
                           symbols=args.symbols, years=args.years, query=args.query, limit=args.limit)
        if args.demo:
            data["demo"] = True
        if args.cache:
            print("Cache: %d reused, %d requested." % (stats.get("reused", 0), stats.get("requested", 0)),
                  file=sys.stderr)
        if args.csv:
            write_csv(args.csv, *table_rows(data))
            print("Wrote %s. Keep it private." % args.csv, file=sys.stderr)
        print(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False))
    except ZenithError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
