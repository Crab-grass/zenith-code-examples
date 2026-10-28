"""Fetch one annual income-statement response. Never save the API key."""
import getpass
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

URL = "https://api.zenithcode.net/stable/income-statement?symbol=7203&period=annual&limit=10"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    key = os.environ.get("ZENITH_API_KEY") or getpass.getpass("API key (hidden): ")
    if not key.strip():
        raise SystemExit("APIキーが空です。入力し直してください。")
    request = Request(URL, headers={"x-api-key": key.strip(), "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            rows = json.load(response)
    except HTTPError as error:
        hints = {401: "APIキーを確認", 403: "キーの状態・利用権限を確認",
                 429: "利用上限やレート制限を確認し、時間を置く"}
        raise SystemExit(f"HTTP {error.code}: {hints.get(error.code, '公式のエラー説明を確認')}") from None
    except (URLError, TimeoutError, ValueError):
        raise SystemExit("通信またはJSONの読み取りに失敗しました。接続状況を確認してください。") from None
    if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
        raise SystemExit("想定したデータ一覧ではありません。API仕様を確認してください。")
    payload = {"retrievedAt": datetime.now(timezone.utc).isoformat(), "url": URL, "rows": rows}
    Path("toyota-income.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"toyota-income.json に {len(rows)} 件保存しました。APIキーは保存していません。")


if __name__ == "__main__":
    main()
