"""Local examples for ZENITH Code. Python 3.9+, standard library only."""
import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

BASE_URL = "https://api.zenithcode.net/stable"


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


def run_example(mode, symbol, api_key, start=None, end=None, requester=request_rows):
    if not re.fullmatch(r"[0-9A-Z]{4,5}(?:\.T)?", symbol):
        raise ZenithError("Use a securities code such as 7203 or 130A.")
    if mode not in ("snapshot", "history", "financials", "full"):
        raise ZenithError("Choose snapshot, history, financials or full.")
    result = {"symbol": symbol, "retrievedAt": datetime.now(timezone.utc).isoformat()}
    if mode == "history":
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["snapshot", "history", "financials", "full"])
    parser.add_argument("--symbol", default="7203")
    parser.add_argument("--from", dest="start")
    parser.add_argument("--to", dest="end")
    args = parser.parse_args()
    try:
        key = os.environ.get("ZENITH_API_KEY", "")
        if not key and sys.stdin.isatty():
            key = getpass.getpass("ZENITH API key (hidden): ")
        if not key.strip():
            raise ZenithError("Set ZENITH_API_KEY or run interactively to enter your key.")
        print("Local/private use: do not publish API responses or API keys.", file=sys.stderr)
        data = run_example(args.mode, args.symbol, key, args.start, args.end)
        print(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False))
    except ZenithError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
