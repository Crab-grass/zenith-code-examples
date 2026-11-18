import json, os, sys, urllib.request
import matplotlib.pyplot as plt

API = "https://api.zenithcode.net/stable/income-statement"

def annual(symbol, years=12):
    url = f"{API}?symbol={symbol}&period=annual&limit={years}"
    req = urllib.request.Request(url, headers={"x-api-key": os.environ["ZENITH_API_KEY"]})
    with urllib.request.urlopen(req) as res:
        return sorted(json.load(res), key=lambda r: r["fiscalPeriod"])

def billions(rows, field):  # JPY billions; missing values stay gaps, never zeros
    return [r[field] / 1e9 if r.get(field) is not None else float("nan") for r in rows]

symbol = sys.argv[1] if len(sys.argv) > 1 else "7974"  # 7974 = Nintendo
rows = annual(symbol)
if not rows:
    sys.exit(f"No annual statements for {symbol}. Check the securities code.")
standards = sorted({r["accountingStandard"] for r in rows})
if len(standards) > 1:
    print(f"Note: accounting standard changes within this range: {standards}")

years = [r["fiscalPeriod"] for r in rows]  # "2026-03" = year ending March 2026
plt.bar(years, billions(rows, "revenue"), color="#9ec5fe", label="Revenue")
plt.plot(years, billions(rows, "operatingIncome"), "o-", color="#e4002b", label="Operating income")
plt.ylabel("JPY billions"); plt.xticks(rotation=45); plt.legend(); plt.title(f"{symbol}: annual results")
plt.tight_layout(); plt.savefig(f"{symbol}.png", dpi=150)
print(f"Saved {symbol}.png ({years[0]} to {years[-1]})")
