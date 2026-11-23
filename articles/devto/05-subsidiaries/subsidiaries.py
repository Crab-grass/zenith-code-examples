import json, os, re, sys, time, urllib.error, urllib.request
import matplotlib.pyplot as plt

API = "https://api.zenithcode.net/stable/subsidiaries"
FULL_TO_HALF = str.maketrans("０１２３４５６７８９，", "0123456789,")
COMPANIES = [
    ("6501", "Hitachi"), ("7267", "Honda"), ("6701", "NEC"),
    ("6503", "Mitsubishi Electric"), ("7201", "Nissan"), ("6702", "Fujitsu"),
    ("2801", "Kikkoman"), ("7203", "Toyota"), ("7974", "Nintendo"),
]
EDGE_CASES = [("9984", "SoftBank Group"), ("8951", "404 example")]

def fetch_subsidiaries(symbol):
    req = urllib.request.Request(f"{API}?symbol={symbol}", headers={"x-api-key": os.environ["ZENITH_API_KEY"]})
    try:
        with urllib.request.urlopen(req) as res:
            data = json.load(res)
            return data[0] if data else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def parse_other_consolidated(filing):
    items = [oc for oc in (filing.get("otherCounts") or []) if oc.get("category") == "consolidated-subsidiary"]
    if items:
        if any(not isinstance(oc.get("count"), int) for oc in items):
            return None, "needs review"
        return sum(oc["count"] for oc in items), "otherCounts"
    notes = filing.get("otherNotes") or []
    if not notes:
        return None, "unknown"
    total, matched = 0, False
    for raw in notes:
        if not isinstance(raw, str):
            return None, "needs review"
        text = raw.translate(FULL_TO_HALF)
        if "連結子会社" not in text:
            continue
        nums = re.findall(r"([0-9,]+)\s*社", text)
        if len(nums) != 1 or any(k in text for k in ("持分法", "関連会社")) or not any(k in text for k in ("ほか", "以外", "その他")):
            return None, "needs review"
        total += int(nums[0].replace(",", ""))
        matched = True
    return (total, "otherNotes") if matched else (None, "needs review")

targets = COMPANIES + (EDGE_CASES if "--include-edge-cases" in sys.argv else [])
rows = []
for i, (sym, label) in enumerate(targets):
    if i > 0: time.sleep(6.5)  # stay under 10 requests/minute on the free tier
    filing = fetch_subsidiaries(sym)
    if not filing:
        print(f"{sym} ({label}): no subsidiaries data for this symbol")
        continue
    table_rows = (filing.get("counts") or {}).get("consolidated-subsidiary")
    other_cnt, status = parse_other_consolidated(filing)
    print(f"{sym} ({label}): {table_rows} table rows, other={other_cnt} ({status})")
    if isinstance(table_rows, int):
        rows.append((label, table_rows, other_cnt, status))

rows.sort(key=lambda r: (r[2] is not None, r[1] + (r[2] or 0)))
fig, ax = plt.subplots(figsize=(9, 5.5))
ax.barh([r[0] for r in rows], [r[1] for r in rows], color="#0f172a", label="Listed in table (rows)")
ax.barh([r[0] for r in rows], [r[2] or 0 for r in rows], left=[r[1] for r in rows], color="#38bdf8", label='Grouped under "other" (as written)')
for idx, (_, t_val, o_val, status) in enumerate(rows):
    if o_val is None: ax.text(t_val + 8, idx, f"other: {status}", va="center", fontsize=8, color="#475569")
ax.set(xlabel="Table rows and 'other' count as written (not always additive)", title='Table rows vs. "other" consolidated subsidiaries (latest annual report)')
ax.legend(loc="lower right"); fig.tight_layout(); fig.savefig("subsidiaries_table_vs_other.png", dpi=150)
