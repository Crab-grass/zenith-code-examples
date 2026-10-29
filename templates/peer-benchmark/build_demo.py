#!/usr/bin/env python3
"""Write demo.json: a saved snapshot of exactly what the browser receives in live mode.

The key is read from ZENITH_API_KEY or a hidden prompt, never from the command line.
Requests: 1 (/peers for the target) + 1 per listed peer the target's suggestions do not
name (/peers?limit=1, for its name) + 6 per company + 1 (/industry-benchmarks).
"""
import argparse
import getpass
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
# Load the sibling server.py under a unique name so it cannot clash with other templates.
_spec = importlib.util.spec_from_file_location("peer_benchmark_server", ROOT / "server.py")
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)
MAX_COMPANIES, PEER_FIELDS, SECTOR, SYMBOL = server.MAX_COMPANIES, server.PEER_FIELDS, server.SECTOR, server.SYMBOL
ZenithError, fetch_bundle, fetch_peers, request_rows = server.ZenithError, server.fetch_bundle, server.fetch_peers, server.request_rows

DEFAULT_TARGET = "7203"
DEFAULT_PEERS = ("7267", "7269", "7270", "7261", "7201")
# Last line of defence: refuse to write a file that contains any of these keys.
BANNED = {"price", "marketCap", "per", "pbr", "psr", "evToEbitda", "dividendYield", "changePctYtd",
          "marketCapRank", "marketCapRatio", "perForecast", "archiveUrl"}


def build_snapshot(target, peers, api_key, requester=request_rows):
    suggested = fetch_peers(target, api_key, requester)
    known = {p["symbol"]: p for p in suggested["peers"]}
    listed = []
    for symbol in peers:
        row = known.get(symbol) or fetch_peers(symbol, api_key, requester, limit=1)["target"]
        listed.append({field: (row.get(field) if field != "role" else "peer") for field in PEER_FIELDS})
    sector = suggested["target"].get("sector")
    sector = sector if isinstance(sector, str) and SECTOR.fullmatch(sector) else None
    comparison = fetch_bundle([target, *peers], api_key, requester, sector=sector)
    snapshot = {"peers": {**suggested, "peers": listed}, "comparison": comparison}
    _check(snapshot)
    return snapshot


def _check(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in BANNED:
                raise ValueError("refusing to write price-derived field: " + key)
            _check(item)
    elif isinstance(value, list):
        for item in value:
            _check(item)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(ROOT / "demo.json"))
    parser.add_argument("--target", default=DEFAULT_TARGET)
    parser.add_argument("--peers", default=",".join(DEFAULT_PEERS), help="comma-separated, up to 5")
    args = parser.parse_args()
    peers = [p.strip() for p in args.peers.split(",") if p.strip()]
    codes = [args.target, *peers]
    if not peers or len(codes) > MAX_COMPANIES or len(set(codes)) != len(codes) or not all(SYMBOL.fullmatch(c) for c in codes):
        parser.error("Use a valid target and 1-%d distinct peer codes." % (MAX_COMPANIES - 1))
    key = os.environ.get("ZENITH_API_KEY", "").strip()
    if not key and sys.stdin.isatty():
        key = getpass.getpass("ZENITH API key (hidden): ").strip()
    if not key:
        parser.error("Set ZENITH_API_KEY or run interactively. Do not pass a key on the command line.")
    try:
        snapshot = build_snapshot(args.target, peers, key)
    except ZenithError as error:
        sys.exit("Fetch failed: %s Nothing was written." % error)
    except (ValueError, TypeError, KeyError) as error:
        sys.exit("Unexpected response (%s). Nothing was written." % type(error).__name__)
    out = Path(args.out)
    # Write atomically so a failed run never leaves a half-written demo file.
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(out.parent), delete=False, suffix=".tmp") as tmp:
        json.dump(snapshot, tmp, ensure_ascii=False, indent=1, allow_nan=False)
        tmp.write("\n")
    os.replace(tmp.name, out)
    print("Wrote %s (%d companies, retrieved %s)." % (out, len(codes), snapshot["comparison"]["retrievedAt"]))


if __name__ == "__main__":
    main()
