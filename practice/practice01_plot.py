"""Plot the fixed 2021–2025 Toyota example from a locally saved API response."""
import csv
import json
import math
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.transforms import blended_transform_factory
from matplotlib.path import Path as PlotPath
from matplotlib.patches import PathPatch

TARGETS = [f"{year}-03" for year in range(2021, 2026)]


def select_rows(rows):
    selected = {}
    for row in rows:
        period = row.get("fiscalPeriod")
        if period not in TARGETS:
            continue
        if period in selected:
            raise ValueError(f"{period}: 同じ決算期が複数あります。出典を確認してください。")
        if (row.get("symbol"), row.get("period"), row.get("accountingStandard")) != ("7203", "FY", "ifrs"):
            raise ValueError(f"{period}: 企業・通期・会計基準の条件を確認してください。")
        for field in ("revenue", "operatingIncome"):
            value = row.get(field)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"{period}: {field} が欠損または不正です。0に置き換えず確認してください。")
        selected[period] = row
    missing = set(TARGETS) - selected.keys()
    if missing:
        raise ValueError(f"対象年が不足しています: {', '.join(sorted(missing))}")
    return [selected[period] for period in TARGETS]


def draw(rows, retrieved_at, output):
    available = {font.name for font in font_manager.fontManager.ttflist}
    font = next((name for name in ["Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP"] if name in available), None)
    if font:
        plt.rcParams["font.family"] = font
    jp = font is not None
    plt.rcParams["axes.unicode_minus"] = False
    ink, muted, grid = "#172f43", "#526679", "#dce8ec"
    fig = plt.figure(figsize=(6.4, 6.2), facecolor="white")
    fig.text(.07, 1 - .448 / 6.2, "ZENITH Code / PRACTICE 01", fontsize=9, color="#006875", weight="bold", va="top")
    title = "トヨタ自動車（7203）\n売上高と営業利益の推移" if jp else "Toyota (7203)\nRevenue and operating income"
    fig.text(.07, 1 - .768 / 6.2, title, fontsize=18, weight="bold", color=ink, va="top", linespacing=1.35)
    subtitle = "2021〜2025年3月期 ／ 連結・IFRS・通期" if jp else "FY ended March 2021–2025 / Consolidated IFRS"
    fig.text(.07, 1 - 1.533 / 6.2, subtitle, fontsize=10, color=muted)
    specs = [("revenue", "売上高" if jp else "Revenue", "#007d8a", .47),
             ("operatingIncome", "営業利益" if jp else "Operating income", "#486580", .16)]
    for field, label, color, bottom in specs:
        ax = fig.add_axes([.14, bottom, .80, .20])
        values = [row[field] / 1_000_000_000_000 for row in rows]
        fig.text(.07, bottom + .225, label + ("（兆円）" if jp else " (JPY trillion)"),
                 fontsize=12, weight="bold", color=ink, va="bottom")
        ax.set_xlim(-.6, 4.6)
        ax.set_xticks(range(5), [p[:4] for p in TARGETS], fontsize=10)
        low, high = min(0, min(values)), max(0, max(values))
        span = high - low or 1
        ax.set_ylim(low - (span*.15 if low < 0 else 0), high + span*.25)
        ax.axhline(0, color=grid, linewidth=1)
        for index, value in enumerate(values):
            # 上端だけを小さく丸めます。棒の高さは元の値と同じです。
            left, right = index - .26, index + .26
            rx, ry = .035, min(abs(value) / 2, span * .025)
            if value > 0:
                vertices = [(left, 0), (left, value-ry), (left, value),
                            (left+rx, value), (right-rx, value), (right, value),
                            (right, value-ry), (right, 0), (left, 0)]
                codes = [PlotPath.MOVETO, PlotPath.LINETO, PlotPath.CURVE3,
                         PlotPath.CURVE3, PlotPath.LINETO, PlotPath.CURVE3,
                         PlotPath.CURVE3, PlotPath.LINETO, PlotPath.CLOSEPOLY]
                ax.add_patch(PathPatch(PlotPath(vertices, codes), facecolor=color,
                                       edgecolor="none", zorder=3))
            else:
                ax.bar(index, value, width=.52, color=color, zorder=3)
            ax.text(index, value + (span*.035 if value >= 0 else -span*.035), f"{value:.2f}", ha="center",
                    va="bottom" if value >= 0 else "top", fontsize=10, color=ink)
        ax.spines[["top", "right", "left"]].set_visible(False)
        ax.spines["bottom"].set_color(grid)
        ax.tick_params(length=0, colors=muted, labelsize=9, pad=6)
        ax.grid(axis="y", color=grid, linewidth=.6, zorder=0)
        ax.set_axisbelow(True)
        # 縦軸の数字も、タイトルと同じ左端から表示します。
        ax.tick_params(axis="y", labelleft=False)
        label_transform = blended_transform_factory(fig.transFigure, ax.transData)
        for tick in ax.get_yticks():
            if ax.get_ylim()[0] <= tick <= ax.get_ylim()[1]:
                ax.text(.07, tick, f"{tick:g}", transform=label_transform,
                        ha="left", va="center", fontsize=9, color=muted)
    date = retrieved_at[:10]
    note = (f"出典：ZENITH Code API ／ 取得日 {date}（UTC）\n上下の縦軸の目盛りは異なります。表示は小数第2位に丸めています。"
            if jp else f"Source: ZENITH Code API / Retrieved {date} (UTC)\nPanels use different y-axis scales. Labels rounded to 2 decimals.")
    fig.text(.07, .045, note, fontsize=8, color=muted, linespacing=1.6)
    fig.savefig(output, dpi=200)
    plt.close(fig)


def main():
    payload = json.loads(Path("toyota-income.json").read_text(encoding="utf-8"))
    rows = select_rows(payload["rows"])
    with Path("toyota-income.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["fiscalPeriod", "revenue_JPY", "operatingIncome_JPY", "docId"])
        writer.writerows((r["fiscalPeriod"], r["revenue"], r["operatingIncome"], r.get("provenance", {}).get("docId")) for r in rows)
    draw(rows, payload["retrievedAt"], "toyota-income.png")
    print("toyota-income.png と toyota-income.csv を作成しました。")


if __name__ == "__main__":
    main()
