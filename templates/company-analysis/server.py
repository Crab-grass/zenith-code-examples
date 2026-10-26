#!/usr/bin/env python3
"""Private, loopback-only company analysis template. Python 3.9+, no packages."""
import argparse
import getpass
import json
import os
from pathlib import Path
import secrets
import sys
import threading
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "python"))
from zenith_examples import ZenithError, run_example  # noqa: E402

STATIC = {"/": ("index.html", "text/html"), "/app.mjs": ("app.mjs", "text/javascript"),
          "/model.mjs": ("model.mjs", "text/javascript"), "/style.css": ("style.css", "text/css")}


def make_server(port=8765, api_key="", loader=run_example):
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
            expected = "127.0.0.1:%d" % self.server.server_port
            if self.headers.get("Host") != expected:
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
            if self.path != "/api/snapshot":
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
            import re
            if not re.fullmatch(r"[0-9A-Z]{4,5}(?:\.T)?", body["symbol"]):
                self.reply(400, {"error": "invalid_symbol"})
                return
            if not gate.acquire(blocking=False):
                self.reply(429, {"error": "busy"})
                return
            try:
                result = loader("snapshot", body["symbol"], api_key)
                self.reply(200, {"mode": "live", "snapshot": result})
            except ZenithError:
                # Never relay exception bodies or upstream content into the UI.
                self.reply(502, {"error": "upstream_failed"})
            except (ValueError, TypeError, OverflowError):
                self.reply(502, {"error": "invalid_response"})
            finally:
                gate.release()

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
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
        print("Synthetic demo ready. Live access: %s. Ctrl+C to stop." % ("enabled; fetches require a click" if key else "disabled"), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
