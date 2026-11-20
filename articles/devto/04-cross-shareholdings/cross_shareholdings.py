import json, math, os, urllib.error, urllib.request
import matplotlib.pyplot as plt

API = "https://api.zenithcode.net/stable/cross-shareholdings"
COMPANIES = [("7203", "Toyota"), ("7269", "Suzuki"), ("7974", "Nintendo"), ("6758", "Sony Group")]
# Filings name the other company in full; map the ones we query to the same node label
ALIASES = {"TOYOTA MOTOR CORPORATION": "Toyota", "SUZUKI MOTOR CORPORATION": "Suzuki"}

def latest_holdings(symbol, top_n=4):
    url = f"{API}?symbol={symbol}&limit=1"
    req = urllib.request.Request(url, headers={"x-api-key": os.environ["ZENITH_API_KEY"]})
    try:
        with urllib.request.urlopen(req) as res:
            rows = json.load(res)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    if not rows:
        return []
    items = [h for h in rows[0].get("holdings", []) if h.get("type") == "specified" and h.get("carryingAmount")]
    items.sort(key=lambda h: h["carryingAmount"], reverse=True)
    return items[:top_n]

edges, nodes = [], set()
for sym, name in COMPANIES:
    nodes.add(name)
    for h in latest_holdings(sym, top_n=4):
        target = (h.get("nameEn") or h.get("name") or "Unknown").split(",")[0]
        target = ALIASES.get(target, target)
        amt_b = h["carryingAmount"] / 1e9
        mutual = h.get("issuerHoldsOwnShares") == "有"
        nodes.add(target)
        edges.append((name, target, amt_b, mutual))

ordered = sorted(nodes)
pos = {n: (math.cos(2 * math.pi * i / len(ordered)), math.sin(2 * math.pi * i / len(ordered))) for i, n in enumerate(ordered)}

fig, ax = plt.subplots(figsize=(9, 7))
for src, dst, amt_b, mutual in edges:
    x1, y1 = pos[src]; x2, y2 = pos[dst]
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="<->" if mutual else "->", color="#d97706" if mutual else "#2563eb", lw=1.5, alpha=0.75,
                                shrinkA=10, shrinkB=10))
for n, (x, y) in pos.items():
    ax.scatter(x, y, s=260, color="#0f172a", edgecolors="#2563eb", lw=2, zorder=3)
    ax.text(x * 1.13, y * 1.13, n, ha="center", va="center", fontsize=8)
ax.set_axis_off(); ax.set_title("Cross-shareholdings (orange = mutual, blue = one-way)")
fig.tight_layout(); fig.savefig("cross_shareholdings.png", dpi=150)
print(f"Saved cross_shareholdings.png ({len(nodes)} nodes, {len(edges)} edges)")
