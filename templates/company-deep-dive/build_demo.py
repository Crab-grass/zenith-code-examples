#!/usr/bin/env python3
"""Save a snapshot of live ZENITH Code data as this template's demo.json.

Each company is saved as the exact fetch_bundle() output the browser receives in live mode
(prices, price-derived values and TDnet document links are already removed by the whitelist).
8 requests per company (7 without a segment report), one after another. Nothing is written
unless every request succeeds. The API key comes from ZENITH_API_KEY or a hidden prompt only.

    python3 templates/company-deep-dive/build_demo.py            # 7203, 9983, 4452
    python3 templates/company-deep-dive/build_demo.py 6758 7974  # your own selection
"""
import argparse
import getpass
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
# Load server.py by path under a unique name so it never clashes with another "server" module.
_spec = importlib.util.spec_from_file_location("company_deep_dive_server", ROOT / "server.py")
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)
SYMBOL, ZenithError, fetch_bundle, request_rows = server.SYMBOL, server.ZenithError, server.fetch_bundle, server.request_rows

# March, August and December fiscal year-ends, so the demo exercises non-March calendars.
DEFAULT_SYMBOLS = ("7203", "9983", "4452")


def build(symbols, api_key, requester=request_rows, out=ROOT / "demo.json"):
    bundles = [fetch_bundle(symbol, api_key, requester) for symbol in symbols]
    text = json.dumps({"placeholder": False, "bundles": bundles}, ensure_ascii=False, indent=1, allow_nan=False) + "\n"
    temporary = Path(str(out) + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, out)  # Replace only after every company was fetched.
    return bundles


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("symbols", nargs="*", default=list(DEFAULT_SYMBOLS), help="Securities codes (default: 7203 9983 4452)")
    parser.add_argument("--out", default=str(ROOT / "demo.json"), help="Output file (default: demo.json next to this script)")
    args = parser.parse_args()
    if not 1 <= len(args.symbols) <= 10 or not all(SYMBOL.fullmatch(s) for s in args.symbols):
        parser.error("Give 1 to 10 securities codes such as 7203 or 130A.")
    key = os.environ.get("ZENITH_API_KEY", "").strip()
    if not key and sys.stdin.isatty():
        key = getpass.getpass("ZENITH API key (hidden): ").strip()
    if not key:
        parser.error("Set ZENITH_API_KEY or run interactively. Do not pass a key on the command line.")
    print("Fetching %d companies, up to %d requests ..." % (len(args.symbols), 8 * len(args.symbols)), flush=True)
    try:
        bundles = build(args.symbols, key, out=Path(args.out))
    except ZenithError as error:
        sys.exit("Stopped; demo.json was not changed. %s" % error)
    except (ValueError, TypeError, KeyError) as error:
        sys.exit("Stopped; unexpected response shape (%s). demo.json was not changed." % type(error).__name__)
    for bundle in bundles:
        print("  %s: %d annual periods, %d forecast rows" % (bundle["symbol"], len(bundle["incomeStatements"]), len(bundle["forecasts"])))
    print("Wrote %s. Check the display rights before publishing screenshots or files." % args.out)


if __name__ == "__main__":
    main()
