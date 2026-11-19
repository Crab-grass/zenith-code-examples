import json, os, urllib.error, urllib.request
import matplotlib.pyplot as plt

API = "https://api.zenithcode.net/stable/diversity"
COMPANIES = [
    ("4911", "Shiseido"), ("4755", "Rakuten Group"),
    ("4385", "Mercari"), ("9983", "Fast Retailing"),
    ("6758", "Sony Group"), ("8058", "Mitsubishi Corp"),
    ("9697", "Capcom"), ("7974", "Nintendo"),
    ("7203", "Toyota"), ("7267", "Honda"),
    ("6861", "Keyence"),  # femaleManagerRatio is null — skipped safely
]

def latest_diversity(symbol):
    url = f"{API}?symbol={symbol}&limit=1"
    req = urllib.request.Request(url, headers={"x-api-key": os.environ["ZENITH_API_KEY"]})
    try:
        with urllib.request.urlopen(req) as res:
            rows = json.load(res)
            return rows[0] if rows else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

points = []
for sym, label in COMPANIES:
    row = latest_diversity(sym)
    rc = (row or {}).get("reportingCompany") or {}
    mgr, gap = rc.get("femaleManagerRatio"), rc.get("wageGapAll")
    if mgr is None or gap is None:
        print(f"Skip {sym} ({label}): missing femaleManagerRatio or wageGapAll")
        continue
    points.append((label, mgr * 100, gap * 100))

fig, ax = plt.subplots(figsize=(8, 5))
for label, mgr, gap in points:
    ax.scatter(mgr, gap, s=80, color="#2563eb")
    ax.annotate(label, (mgr, gap), xytext=(6, 4), textcoords="offset points", fontsize=9)
ax.set_xlabel("Female manager ratio (%)")
ax.set_ylabel("Women's pay as % of men's (all workers)")
ax.set_title("Japanese listed companies: female managers vs. gender pay gap")
ax.grid(True, linestyle="--", alpha=0.4)
fig.tight_layout()
fig.savefig("diversity.png", dpi=150)
print(f"Saved diversity.png ({len(points)} companies)")
