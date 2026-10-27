#!/usr/bin/env python3
"""Draw a dependency-free SVG chart from saved `trend`, `compare`, `quarters` or `health` output.

    python3 python/zenith_examples.py trend --symbol 7203 > output/trend.json
    python3 python/chart_svg.py output/trend.json -o output/trend.svg

Works with JSON from the Python or JavaScript example. Missing values are drawn
as gaps labelled "n/a", never as zero. `compare` charts only fiscal periods that
every company shares, and prints the comparison notes under the chart.
"""
import argparse
import json
import math
import sys
from html import escape
from pathlib import Path

WIDTH = 720
INK, MUTED, GRID = "#172f43", "#526679", "#dce8ec"
COLORS = ("#007d8a", "#c2410c", "#4f46e5", "#a16207")
FONT = "Hiragino Sans, Yu Gothic, Meiryo, Noto Sans CJK JP, system-ui, sans-serif"
TEXT = {
    "en": {"revenue": "Revenue", "margin": "Operating margin (%)", "trend": "{0}: revenue and operating margin",
           "compare": "Operating margin by company (%)", "fy": "Fiscal years ending", "na": "n/a",
           "periods": "Fiscal years: {0}",
           "source": "Source: ZENITH Code API · retrieved {0} (UTC)", "demo": "Demo data: fictional companies and values",
           "trillion": "JPY trillion", "billion": "JPY billion", "basis": "Basis: {0}",
           "quarters": "{0}: standalone quarters", "quarterRevenue": "Revenue per quarter",
           "quarterNote": "Q2–Q4 = cumulative figure minus the previous one; gaps are not estimated",
           "health": "{0}: equity ratio and free cash flow", "equityRatio": "Equity ratio (%)",
           "fcf": "Free cash flow"},
    "ja": {"revenue": "売上高", "margin": "営業利益率（%）", "trend": "{0}：売上高と営業利益率",
           "compare": "企業別の営業利益率（%）", "fy": "決算期", "na": "欠損",
           "periods": "決算期：{0}",
           "source": "出典：ZENITH Code API ／ 取得日 {0}（UTC）", "demo": "デモデータ：架空の企業・数値",
           "trillion": "兆円", "billion": "億円", "basis": "会計基準：{0}",
           "quarters": "{0}：四半期単独の推移", "quarterRevenue": "四半期の売上高",
           "quarterNote": "第2〜第4四半期は累計値から前の累計値を差し引いた値。欠損は推測しません",
           "health": "{0}：自己資本比率とフリー・キャッシュ・フロー", "equityRatio": "自己資本比率（%）",
           "fcf": "フリー・キャッシュ・フロー"},
}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def text(x, y, body, size=12, color=INK, anchor="start", weight="normal"):
    return ('<text x="%.1f" y="%.1f" font-size="%d" fill="%s" text-anchor="%s" font-weight="%s">%s</text>'
            % (x, y, size, color, anchor, weight, escape(str(body))))


def scale(values, top, height):
    present = [v for v in values if number(v)] or [0]
    low, high = min(0, min(present)), max(0, max(present))
    span = (high - low) or 1
    high += span * 0.15
    if low < 0:
        low -= span * 0.15  # room for labels under negative bars
    return lambda v: top + height * (high - v) / (high - low)


def bars(x0, width, top, height, labels, series, colors, fmt, na):
    """Grouped bars; series is a list of value lists aligned with labels."""
    y = scale([v for values in series for v in values], top, height)
    out = ['<line x1="%.1f" x2="%.1f" y1="%.1f" y2="%.1f" stroke="%s"/>' % (x0, x0 + width, y(0), y(0), GRID)]
    slot = width / max(len(labels), 1)
    bar = min(48, slot * 0.7 / max(len(series), 1))
    for i, label in enumerate(labels):
        left = x0 + slot * i + (slot - bar * len(series)) / 2
        for k, values in enumerate(series):
            v, cx = values[i], left + bar * k + bar / 2
            if not number(v):
                out.append(text(cx, y(0) - 6, na, 10, MUTED, "middle"))
                continue
            top_y, bottom_y = sorted((y(v), y(0)))
            out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" fill="%s"/>'
                       % (cx - bar / 2 + 2, top_y, bar - 4, max(bottom_y - top_y, 0.5), colors[k % len(colors)]))
            out.append(text(cx, top_y - 5 if v >= 0 else bottom_y + 13, fmt(v), 10, INK, "middle"))
        out.append(text(x0 + slot * i + slot / 2, top + height + 16, label, 11, MUTED, "middle"))
    return out


def line(x0, width, top, height, labels, values, color, na):
    y = scale(values, top, height)
    slot = width / max(len(labels), 1)
    points = [(x0 + slot * i + slot / 2, y(v) if number(v) else None) for i, v in enumerate(values)]
    out = ['<line x1="%.1f" x2="%.1f" y1="%.1f" y2="%.1f" stroke="%s"/>' % (x0, x0 + width, y(0), y(0), GRID)]
    run = []
    for (px, py) in points + [(None, None)]:  # break the line at gaps
        if py is None:
            if len(run) > 1:
                out.append('<polyline fill="none" stroke="%s" stroke-width="2" points="%s"/>'
                           % (color, " ".join("%.1f,%.1f" % p for p in run)))
            run = []
        else:
            run.append((px, py))
    for (px, py), v, label in zip(points, values, labels):
        if py is None:
            out.append(text(px, y(0) - 6, na, 10, MUTED, "middle"))
        else:
            out.append('<circle cx="%.1f" cy="%.1f" r="4" fill="white" stroke="%s" stroke-width="2"/>' % (px, py, color))
            out.append(text(px, py - 9, "%.1f%%" % (v * 100), 10, INK, "middle"))
        out.append(text(px, top + height + 16, label, 11, MUTED, "middle"))
    return out


def yen_scale(values, t):
    big = max([abs(v) for v in values if number(v)] or [0]) >= 1e12
    unit, div = (t["trillion"], 1e12) if big else (t["billion"], 1e8 if t is TEXT["ja"] else 1e9)
    fmt = (lambda v: "%.2f" % v) if div == 1e12 else (lambda v: "{:,.0f}".format(v))
    return unit, div, fmt


def heading(label, unit, t):
    return label + (("（%s）" if t is TEXT["ja"] else " (%s)") % unit if unit else "")


def two_panels(title, subtitle, labels, bar_label, bar_values, line_label, line_values, t, short_labels=None):
    """Yen bars on top, a ratio line below; both share the x labels."""
    unit, div, fmt = yen_scale(bar_values, t)
    axis = short_labels or labels
    body = [text(32, 40, title, 20, INK, weight="bold"), text(32, 62, subtitle, 12, MUTED),
            text(32, 100, heading(bar_label, unit, t), 13, INK, weight="bold")]
    body += bars(48, WIDTH - 80, 112, 120, axis, [[v / div if number(v) else None for v in bar_values]],
                 COLORS, fmt, t["na"])
    body.append(text(32, 290, line_label, 13, INK, weight="bold"))
    body += line(48, WIDTH - 80, 302, 110, axis, line_values, COLORS[0], t["na"])
    return body, 500


def basis(rows, t):
    return t["basis"].format(", ".join(sorted({str(r.get("accountingStandard") or "?").upper() for r in rows})))


def render_trend(data, t):
    rows = data["annualTrend"]
    if not rows:
        raise ValueError("The trend result has no rows.")
    labels = [r["fiscalPeriod"] for r in rows]
    return two_panels(t["trend"].format(data.get("symbol", "")),
                      "%s %s – %s · %s" % (t["fy"], labels[0], labels[-1], basis(rows, t)),
                      labels, t["revenue"], [r.get("revenue") for r in rows],
                      t["margin"], [r.get("calculatedMargin") for r in rows], t)


def render_quarters(data, t):
    rows = data["quarters"]
    if not rows:
        raise ValueError("The quarters result has no rows.")
    labels = ["%s %s" % (r["fiscalYearEnd"], r["quarter"]) for r in rows]
    short = [r["quarter"] if i and r["quarter"] != "Q1" else "%s %s" % (r["fiscalYearEnd"][:4], r["quarter"])
             for i, r in enumerate(rows)]
    return two_panels(t["quarters"].format(data.get("symbol", "")), "%s · %s" % (t["quarterNote"], basis(rows, t)),
                      labels, t["quarterRevenue"], [r.get("revenue") for r in rows],
                      t["margin"], [r.get("operatingMargin") for r in rows], t, short)


def render_health(data, t):
    rows = data["health"]
    if not rows:
        raise ValueError("The health result has no rows.")
    labels = [r["fiscalPeriod"] for r in rows]
    body, height = two_panels(t["health"].format(data.get("symbol", "")),
                              "%s %s – %s · %s" % (t["fy"], labels[0], labels[-1], basis(rows, t)),
                              labels, t["fcf"], [r.get("freeCashFlow") for r in rows],
                              t["equityRatio"], [r.get("equityRatio") for r in rows], t)
    return body, height


def render_compare(data, t):
    periods = data.get("commonFiscalPeriods") or []
    if not periods:
        raise ValueError("No fiscal period is shared by every company; choose a pairing rule before charting.")
    codes = list(data["companies"])
    series = [[next((r.get("calculatedMargin") for r in data["companies"][c] if r["fiscalPeriod"] == p), None)
               for p in periods] for c in codes]
    body = [text(32, 40, t["compare"], 20, INK, weight="bold"),
            text(32, 62, t["periods"].format(", ".join(periods)), 12, MUTED)]
    for k, code in enumerate(codes):
        x = 32 + k * 150
        body.append('<rect x="%d" y="78" width="12" height="12" rx="2" fill="%s"/>' % (x, COLORS[k % len(COLORS)]))
        body.append(text(x + 18, 89, code, 12))
    body += bars(48, WIDTH - 80, 112, 220, periods,
                 [[v * 100 if number(v) else None for v in s] for s in series], COLORS, lambda v: "%.1f" % v, t["na"])
    y = 380
    for note in data.get("notes", []):
        body.append(text(32, y, "• " + note, 11, MUTED))
        y += 16
    return body, y + 34


def render(data, lang="en"):
    t = TEXT[lang]
    if "annualTrend" in data:
        body, height = render_trend(data, t)
    elif "quarters" in data:
        body, height = render_quarters(data, t)
    elif "health" in data:
        body, height = render_health(data, t)
    elif "companies" in data and "commonFiscalPeriods" in data:
        body, height = render_compare(data, t)
    else:
        raise ValueError("Use JSON saved from the trend, compare, quarters or health command.")
    footer = [t["source"].format(str(data.get("retrievedAt", ""))[:10])]
    if data.get("demo"):
        footer.insert(0, t["demo"])
    for i, note in enumerate(footer):
        body.append(text(32, height - 18 + i * 14 - 14 * (len(footer) - 1), note, 10, MUTED))
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            'font-family="{f}" role="img"><rect width="100%" height="100%" fill="white"/>\n{b}\n</svg>\n'
            ).format(w=WIDTH, h=height, f=FONT, b="\n".join(body))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", help="JSON saved from trend, compare, quarters or health")
    parser.add_argument("-o", "--output", required=True, help="SVG file to write")
    parser.add_argument("--lang", choices=sorted(TEXT), default="en")
    args = parser.parse_args()
    try:
        data = json.loads(Path(args.input).read_text(encoding="utf-8"))
        svg = render(data, args.lang)
    except (OSError, ValueError, KeyError) as error:
        print("Cannot draw chart: %s" % error, file=sys.stderr)
        return 1
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(svg, encoding="utf-8")
    print("Wrote %s. Charts of real data are for private use." % args.output, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
