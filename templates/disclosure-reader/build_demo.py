#!/usr/bin/env python3
"""Save a snapshot of live ZENITH Code data as this template's demo.json.

The file is the exact fetch_bundle() output the browser receives in live mode: prices,
price-derived values (including cross-shareholding carrying amounts) and TDnet document links
are already removed by the whitelist. 12 requests per company, 13 when the company reports main
customers, one after another. Nothing is written unless every request succeeds (a 404 means the
disclosure does not exist and is kept as empty). The key comes from ZENITH_API_KEY or a hidden
prompt only.

    python3 templates/disclosure-reader/build_demo.py                 # 7203 6902 7267 7261 7217
    python3 templates/disclosure-reader/build_demo.py 6758 6752 6501  # your own selection
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
_spec = importlib.util.spec_from_file_location("disclosure_reader_server", ROOT / "server.py")
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)
SYMBOL, ZenithError, fetch_bundle, request_rows = server.SYMBOL, server.ZenithError, server.fetch_bundle, server.request_rows

# Four automakers and suppliers that hold each other's shares, plus a smaller parts maker. Denso
# and the parts maker report main customers; Toyota, Honda and Mazda do not.
DEFAULT_SYMBOLS = ("7203", "6902", "7267", "7261", "7217")
MAX_SAVED = 8
# Last line of defence: refuse to write a file that contains any of these keys.
BANNED = {"price", "marketCap", "per", "pbr", "psr", "beta", "dividendYield", "priceDate", "archiveUrl",
          "carryingAmount", "priorCarryingAmount", "chars", "address", "holderNameRaw"}


def check(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in BANNED:
                raise ValueError("refusing to write a field that must not be shown: " + key)
            check(item)
    elif isinstance(value, list):
        for item in value:
            check(item)
    elif isinstance(value, str) and value.startswith("http") and not server.edinet_url(value):
        raise ValueError("refusing to write a non-EDINET link")


def build(symbols, api_key, requester=request_rows, out=ROOT / "demo.json"):
    bundle = fetch_bundle(list(symbols), api_key, requester)
    snapshot = {"placeholder": False, "retrievedAt": bundle["retrievedAt"], "companies": bundle["companies"]}
    check(snapshot)
    text = json.dumps(snapshot, ensure_ascii=False, indent=1, allow_nan=False) + "\n"
    temporary = Path(str(out) + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, out)  # Replace only after every company was fetched.
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("symbols", nargs="*", default=list(DEFAULT_SYMBOLS),
                        help="Securities codes (default: %s)" % " ".join(DEFAULT_SYMBOLS))
    parser.add_argument("--out", default=str(ROOT / "demo.json"), help="Output file (default: demo.json next to this script)")
    args = parser.parse_args()
    codes = args.symbols
    if not server.MIN_COMPANIES <= len(codes) <= MAX_SAVED or len(set(codes)) != len(codes) or not all(SYMBOL.fullmatch(s) for s in codes):
        parser.error("Give %d to %d distinct securities codes such as 7203 or 130A." % (server.MIN_COMPANIES, MAX_SAVED))
    key = os.environ.get("ZENITH_API_KEY", "").strip()
    if not key and sys.stdin.isatty():
        key = getpass.getpass("ZENITH API key (hidden): ").strip()
    if not key:
        parser.error("Set ZENITH_API_KEY or run interactively. Do not pass a key on the command line.")
    print("Fetching %d companies, up to %d requests ..." % (len(codes), 13 * len(codes)), flush=True)
    try:
        snapshot = build(codes, key, out=Path(args.out))
    except ZenithError as error:
        sys.exit("Stopped; demo.json was not changed. %s" % error)
    except (ValueError, TypeError, KeyError) as error:
        sys.exit("Stopped; unexpected response (%s). demo.json was not changed." % type(error).__name__)
    for company in snapshot["companies"]:
        texts = [tag for tag, block in company["texts"].items() if block]
        print("  %s: sections %s, %d major shareholders, customers %s" % (
            company["symbol"], ",".join(texts) or "-", len(company["majorShareholders"]),
            "yes" if company["mainCustomers"] else "no"))
    print("Wrote %s. Check the display rights before publishing screenshots or files." % args.out)


if __name__ == "__main__":
    main()
