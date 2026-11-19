import json, os, urllib.error, urllib.request
import matplotlib.pyplot as plt

API = "https://api.zenithcode.net/stable/workforce"
COMPANIES = [
    ("6861", "Keyence"), ("8058", "Mitsubishi Corp"),
    ("9984", "SoftBank Group"), ("9983", "Fast Retailing"),
    ("4385", "Mercari"), ("6758", "Sony Group"),
    ("7203", "Toyota"), ("9697", "Capcom"),
    ("7974", "Nintendo"), ("7267", "Honda"),
]

def latest_workforce(symbol):
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
    row = latest_workforce(sym)
    if not row or row.get("averageAnnualSalary") is None or row.get("averageAge") is None:
        print(f"Skip {sym} ({label}): no workforce data")
        continue
    points.append((label, row["averageAge"], row["averageAnnualSalary"] / 1e6))

fig, ax = plt.subplots(figsize=(8, 5))
for label, age, sal in points:
    ax.scatter(age, sal, s=80, color="#2563eb")
    ax.annotate(label, (age, sal), xytext=(6, 4), textcoords="offset points", fontsize=9)
ax.set_xlabel("Average age (years)")
ax.set_ylabel("Average annual salary (JPY millions)")
ax.set_title("Japanese listed companies: average age vs. salary (parent company)")
ax.grid(True, linestyle="--", alpha=0.4)
fig.tight_layout()
fig.savefig("salary_vs_age.png", dpi=150)
print(f"Saved salary_vs_age.png ({len(points)} companies)")
