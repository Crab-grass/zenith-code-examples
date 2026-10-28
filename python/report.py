#!/usr/bin/env python3
"""Write a one-company Markdown report with SVG charts. Standard library only.

    python3 python/report.py --symbol DEMOA --demo --out output/report-demo
    python3 python/report.py --symbol 7203 --cache output/cache --out output/report-7203 --lang ja

Sections: annual trend, standalone quarters, financial health, sector
benchmark and dividends. Each value keeps its fiscal period or date, missing
values stay "n/a", and the report lists the document IDs behind the numbers.
About 10 requests / 19 API tokens with real data; use --cache to rerun free.
The report is for your own analysis: it is not investment advice, and real
data in it must not be published (see the README for data rights).
"""
import argparse
import getpass
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chart_svg  # noqa: E402
from zenith_examples import (ZenithError, cached, demo_requester, request_rows,  # noqa: E402
                             run_example, _number)

TEXT = {
    "en": {"title": "{name} ({code}) — company report", "sector": "Sector", "retrieved": "Retrieved",
           "demo": "**Demo data:** fictional companies and values.",
           "private": "For your own analysis. Not investment advice. Do not publish real data from this report.",
           "trend": "Annual revenue and operating margin", "quarters": "Standalone quarters",
           "health": "Financial health", "benchmark": "Position within the sector",
           "dividends": "Dividends", "sources": "Sources",
           "period": "Fiscal year", "quarter": "Quarter", "revenue": "Revenue", "operatingIncome": "Operating income",
           "margin": "Operating margin", "check": "API check", "status": "Status",
           "equityRatio": "Equity ratio", "currentRatio": "Current ratio", "debtToEquity": "Debt/equity",
           "fcf": "Free cash flow", "flags": "Flags", "metric": "Metric", "value": "Company", "q1": "Sector Q1",
           "median": "Median", "q3": "Sector Q3", "position": "Position", "basis": "Basis",
           "periodEnd": "Period end", "type": "Type", "kind": "Forecast/actual", "amount": "JPY per share",
           "na": "n/a", "bn": "JPY bn", "skipped": "Not available: {0}",
           "quarterNote": "Q2–Q4 are the cumulative figure minus the previous cumulative figure. "
                          "Rows with a status other than ok are not estimated.",
           "benchmarkNote": "Quartiles of the TSE 33-sector statistics. Values the statistics exclude "
                            "(for example a negative PER) are marked, not ranked.",
           "dividendNote": "Annual totals and individual payments are listed separately; do not add them together.",
           "docs": "Document IDs used", "noQuarters": "No quarterly figures in this range."},
    "ja": {"title": "{name}（{code}）企業レポート", "sector": "業種", "retrieved": "取得日時",
           "demo": "**デモデータ：** 架空の企業・数値です。",
           "private": "ご自身の分析用です。投資助言ではありません。実データを含むレポートは公開しないでください。",
           "trend": "通期の売上高と営業利益率", "quarters": "四半期単独の推移",
           "health": "財務の健全性", "benchmark": "業種の中での位置",
           "dividends": "配当", "sources": "出典",
           "period": "決算期", "quarter": "四半期", "revenue": "売上高", "operatingIncome": "営業利益",
           "margin": "営業利益率", "check": "APIとの照合", "status": "状態",
           "equityRatio": "自己資本比率", "currentRatio": "流動比率", "debtToEquity": "有利子負債比率",
           "fcf": "フリー・キャッシュ・フロー", "flags": "目印", "metric": "指標", "value": "この会社",
           "q1": "第1四分位", "median": "中央値", "q3": "第3四分位", "position": "位置", "basis": "基準",
           "periodEnd": "基準日", "type": "種類", "kind": "予想・実績", "amount": "1株当たり（円）",
           "na": "欠損", "bn": "億円", "skipped": "取得できませんでした：{0}",
           "quarterNote": "第2〜第4四半期は、累計値から前の累計値を差し引いた値です。状態がok以外の行は推測しません。",
           "benchmarkNote": "東証33業種の統計の四分位です。統計から除かれる値（マイナスのPERなど）は順位付けせず目印を付けます。",
           "dividendNote": "年間合計と各回の配当は別の行です。足し合わせないでください。",
           "docs": "使った書類のID", "noQuarters": "この期間の四半期の数値はありません。"},
}
RATIO_METRICS = {"roe", "roa", "dividendYield", "revenueCagr3y", "epsCagr3y"}


def yen(value, t):
    if not _number(value):
        return t["na"]
    return "{:,.1f}".format(value / (1e8 if t is TEXT["ja"] else 1e9))


def pct(value, t):
    return "%.1f%%" % (value * 100) if _number(value) else t["na"]


def times(value, t):
    return "%.2f" % value if _number(value) else t["na"]


def unit(label, t):
    return label + ("（%s）" if t is TEXT["ja"] else " (%s)") % t["bn"]


def table(headers, rows):
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(" --- " for _ in headers) + "|"]
    lines += ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]
    return "\n".join(lines)


def build(symbol, api_key, requester, lang="en", demo=False):
    """Return (markdown, {filename: svg}). Sections that fail are reported, not hidden."""
    t = TEXT[lang]
    results, problems = {}, []
    for mode, kwargs in (("trend", {"years": 5}), ("quarters", {"years": 2}), ("health", {"years": 5}),
                         ("benchmark", {}), ("dividends", {"limit": 12})):
        try:
            results[mode] = run_example(mode, symbol, api_key, requester=requester, **kwargs)
        except ZenithError as error:
            problems.append("`%s`: %s" % (mode, error))
    try:
        profile = (requester("/profile", {"symbol": symbol}, api_key) or [{}])[0]
    except ZenithError:
        profile = {}
    name = profile.get("nameEn" if lang == "en" else "nameJa") or profile.get("nameEn") or symbol
    charts, docs = {}, set()
    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = ["# " + t["title"].format(name=name, code=symbol), ""]
    bench = results.get("benchmark") or {}
    sector = bench.get("sectorNameJa" if lang == "ja" else "sectorName") or bench.get("sectorName") \
        or profile.get("sector") or t["na"]
    colon, sep = ("：", "　") if lang == "ja" else (": ", " · ")
    meta = t["sector"] + colon + sector + sep + t["retrieved"] + colon + retrieved
    out += [meta, ""] + ([t["demo"], ""] if demo else []) + ["> " + t["private"], ""]

    def chart(key, data):
        data = dict(data, demo=demo)
        try:
            charts[key + ".svg"] = chart_svg.render(data, lang)
            out.extend(["![%s](%s.svg)" % (key, key), ""])
        except ValueError:
            pass

    if "trend" in results:
        rows = results["trend"]["annualTrend"]
        docs.update(r["docId"] for r in rows if r.get("docId"))
        out += ["## " + t["trend"], ""]
        chart("trend", results["trend"])
        out += [table([t["period"], unit(t["revenue"], t), unit(t["operatingIncome"], t),
                       t["margin"], t["check"]],
                      [(r["fiscalPeriod"], yen(r["revenue"], t), yen(r["operatingIncome"], t),
                        pct(r["calculatedMargin"], t), r["marginCheck"]) for r in rows]), ""]
    if "quarters" in results and not results["quarters"]["quarters"]:
        out += ["## " + t["quarters"], "", t["noQuarters"], ""]
    elif "quarters" in results:
        rows = results["quarters"]["quarters"]
        docs.update(r["docId"] for r in rows if r.get("docId"))
        out += ["## " + t["quarters"], "", t["quarterNote"], ""]
        chart("quarters", results["quarters"])
        out += [table([t["period"], t["quarter"], unit(t["revenue"], t), t["margin"], t["status"]],
                      [(r["fiscalYearEnd"], r["quarter"], yen(r["revenue"], t), pct(r["operatingMargin"], t),
                        r["status"]) for r in rows]), ""]
    if "health" in results:
        rows = results["health"]["health"]
        docs.update(d for r in rows for d in (r.get("balanceSheetDocId"), r.get("cashFlowDocId")) if d)
        out += ["## " + t["health"], ""]
        chart("health", results["health"])
        out += [table([t["period"], t["equityRatio"], t["currentRatio"], t["debtToEquity"],
                       unit(t["fcf"], t), t["flags"]],
                      [(r["fiscalPeriod"], pct(r["equityRatio"], t), times(r["currentRatio"], t),
                        times(r["debtToEquity"], t), yen(r["freeCashFlow"], t), r["flags"] or "—") for r in rows]), ""]
    if "benchmark" in results:
        rows = results["benchmark"]["benchmark"]
        fmt = lambda m, v: pct(v, t) if m in RATIO_METRICS else (yen(v, t) if m == "marketCap" else times(v, t))  # noqa: E731
        out += ["## " + t["benchmark"], "", t["benchmarkNote"], "",
                table([t["metric"], t["value"], t["q1"], t["median"], t["q3"], t["position"], t["basis"]],
                      [(unit(r["metric"], t) if r["metric"] == "marketCap" else r["metric"],
                        fmt(r["metric"], r["value"]), fmt(r["metric"], r["sectorQ1"]),
                        fmt(r["metric"], r["sectorMedian"]), fmt(r["metric"], r["sectorQ3"]),
                        r["position"], r["basis"]) for r in rows]), ""]
    if "dividends" in results:
        rows = results["dividends"]["dividends"]
        out += ["## " + t["dividends"], "", t["dividendNote"], "",
                table([t["periodEnd"], t["type"], t["kind"], t["amount"]],
                      [(r.get("periodEndDate"), r.get("dividendType"), r.get("forecastOrActual"),
                        times(r.get("amount"), t)) for r in rows]), ""]
    out += ["## " + t["sources"], "", "ZENITH Code API (https://zenithcode.net)" + sep + t["retrieved"] + colon + retrieved, ""]
    if docs:
        out += [t["docs"] + colon + ", ".join("`%s`" % d for d in sorted(docs)), ""]
    for problem in problems:
        out += ["- " + t["skipped"].format(problem)]
    return "\n".join(out).rstrip() + "\n", charts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--out", required=True, help="folder for report.md and the SVG charts")
    parser.add_argument("--lang", choices=sorted(TEXT), default="en")
    parser.add_argument("--demo", action="store_true", help="fictional data; no key or network")
    parser.add_argument("--cache", metavar="DIR", help="reuse identical responses saved in DIR")
    args = parser.parse_args()
    if args.demo:
        key, requester = "demo", demo_requester
    else:
        key = os.environ.get("ZENITH_API_KEY", "")
        if not key and sys.stdin.isatty():
            key = getpass.getpass("ZENITH API key (hidden): ")
        if not key.strip():
            print("Set ZENITH_API_KEY or run interactively. To try without a key, add --demo.", file=sys.stderr)
            return 1
        requester = request_rows
    if args.cache:
        requester = cached(requester, args.cache)
    markdown, charts = build(args.symbol, key, requester, args.lang, args.demo)
    folder = Path(args.out)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "report.md").write_text(markdown, encoding="utf-8")
    for name, svg in charts.items():
        (folder / name).write_text(svg, encoding="utf-8")
    print("Wrote %s with %d chart(s). Keep reports with real data private."
          % (folder / "report.md", len(charts)), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
