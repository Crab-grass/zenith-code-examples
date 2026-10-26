#!/usr/bin/env python3
"""Convert three synthetic cumulative sales values into a dependency-free SVG."""
import argparse
import json
from decimal import Decimal, InvalidOperation
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "learning" / "quarterly-sales.json"
ENDS = ("2025-06-30", "2025-09-30", "2025-12-31")
STARTS = ("2025-04-01", "2025-07-01", "2025-10-01")


def standalone_quarters(rows):
    """Require comparable, ordered cumulative actuals; retain both source IDs.

    This fixture-specific exercise does not reconcile filings or revisions.
    It is not suitable for EPS, ratios, balances or arbitrary fiscal calendars.
    """
    if len(rows) != 3:
        raise ValueError("This example requires exactly Q1, Q2 and Q3 cumulative actuals")
    previous = None
    result = []
    for row, start, end in zip(rows, STARTS, ENDS):
        expected = ("SYNTHETIC", "NetSales", "JGAAP", "2025-04-01", end, "consolidated", "actual", "JPY")
        actual = tuple(row.get(k) for k in ("company", "concept", "accounting", "start", "end", "scope", "kind", "unit"))
        if actual != expected or row.get("value") is None or not row.get("source"):
            raise ValueError("Check company, concept, accounting, period, scope, actual/forecast, unit and missing data")
        try:
            cumulative = Decimal(row["value"])
        except (InvalidOperation, TypeError):
            raise ValueError("Expected a decimal string") from None
        if not cumulative.is_finite():
            raise ValueError("Expected a finite value")
        value = cumulative if previous is None else cumulative - previous["cumulative"]
        sources = [row["source"]] if previous is None else [row["source"], previous["source"]]
        result.append({"start": start, "end": end, "value": value, "cumulative": cumulative, "sources": sources})
        previous = {"cumulative": cumulative, "source": row["source"]}
    return result


LABELS = {
    "ja": {
        "title": "累計から四半期単独へ / Cumulative to standalone sales",
        "description": "架空データ、単位は億円。累計20、45、72。単独20、25、27。Q4は未取得。Synthetic data in JPY 100 million; Q4 unavailable.",
        "heading": "累計から、四半期単独の売上高へ",
        "subtitle": "Synthetic data · 架空の学習用データ · 単位：億円 / JPY 100 million",
        "cumulative": "累計 / Cumulative", "cumulative_note": "年度の初めから積み上げた金額",
        "standalone": "単独 / Standalone", "standalone_note": "その3か月間だけの金額",
        "missing": "未取得", "unit": "億円", "formula": "Q2：{q2:g} − {q1:g} ＝ {single:g} 億円",
        "footer": "Q4の欠損は0にしない。通期予想からQ4実績は計算しない。",
    },
    "en": {
        "title": "Cumulative to standalone quarterly sales",
        "description": "Synthetic data in JPY 100 million. Cumulative: 20, 45, 72. Standalone: 20, 25, 27. Q4 unavailable.",
        "heading": "From cumulative to standalone quarterly sales",
        "subtitle": "Synthetic learning data · Unit: JPY 100 million",
        "cumulative": "Cumulative", "cumulative_note": "Total since the fiscal year began",
        "standalone": "Standalone", "standalone_note": "Sales for each three-month period",
        "missing": "N/A", "unit": "JPY 100 million", "formula": "Q2: {q2:g} − {q1:g} = {single:g} (JPY 100 million)",
        "footer": "Missing Q4 is not zero. A full-year forecast cannot yield Q4 actuals.",
    },
}


def chart_svg(quarters, lang="ja"):
    """A fixed teaching chart, labelled as synthetic and with a shared axis."""
    labels = LABELS[lang]
    cumulative = [q["cumulative"] / Decimal("100000000") for q in quarters]
    standalone = [q["value"] / Decimal("100000000") for q in quarters]
    if any(v < 0 or v > 80 for v in cumulative + standalone):
        raise ValueError("This teaching chart supports values from 0 to 80 only")
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720" role="img" aria-labelledby="title desc">',
             f'<title id="title">{labels["title"]}</title>',
             f'<desc id="desc">{labels["description"]}</desc>',
             '<rect width="960" height="720" rx="18" fill="#0b1326"/>',
             '<g font-family="system-ui, sans-serif" fill="#e1edff">',
             f'<text x="40" y="53" font-size="28" font-weight="700">{labels["heading"]}</text>',
             f'<text x="40" y="87" font-size="18" fill="#b8cbdc">{labels["subtitle"]}</text>']
    for left, values, label, sub, color in [(76, cumulative, labels['cumulative'], labels['cumulative_note'], '#c3f5ff'),
                                           (536, standalone, labels['standalone'], labels['standalone_note'], '#00d9ed')]:
        parts += [f'<text x="{left}" y="150" font-size="24" font-weight="700">{label}</text>',
                  f'<text x="{left}" y="181" font-size="17" fill="#b8cbdc">{sub}</text>']
        for tick in (0, 20, 40, 60, 80):
            y = 470 - tick * 2.8
            parts += [f'<path d="M {left} {y:g} h 330" stroke="#30425c"/>',
                      f'<text x="{left - 12}" y="{y+6:g}" text-anchor="end" font-size="16" fill="#b8cbdc">{tick}</text>']
        for i, value in enumerate(values):
            x, height = left + 25 + i * 80, float(value) * 2.8
            parts += [f'<rect x="{x}" y="{470-height:g}" width="48" height="{height:g}" rx="5" fill="{color}"/>',
                      f'<text x="{x+24}" y="{454-height:g}" text-anchor="middle" font-size="25" font-weight="700">{escape(format(value,"g"))}</text>',
                      f'<text x="{x+24}" y="501" text-anchor="middle" font-size="18">Q{i+1}</text>']
        parts += [f'<text x="{left+289}" y="440" text-anchor="middle" font-size="17" fill="#b8cbdc">{labels["missing"]}</text>',
                  f'<text x="{left+289}" y="501" text-anchor="middle" font-size="18">Q4</text>']
    q2, q1, single = cumulative[1], cumulative[0], standalone[1]
    parts += ['<rect x="40" y="540" width="880" height="92" rx="10" fill="#15283d" stroke="#3e6a80"/>',
              f'<text x="480" y="586" text-anchor="middle" dominant-baseline="central" font-size="29" font-weight="700">{labels["formula"].format(q2=q2, q1=q1, single=single)}</text>',
              f'<text x="40" y="672" font-size="18" fill="#b8cbdc">{labels["footer"]}</text>',
              '</g></svg>']
    return "\n".join(parts) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", choices=tuple(LABELS), default="ja", help="Chart and output language (default: ja)")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.output is None:
        name = "quarterly-sales.en.svg" if args.lang == "en" else "quarterly-sales.svg"
        args.output = ROOT / "output" / name
    quarters = standalone_quarters(json.loads(FIXTURE.read_text(encoding="utf-8")))
    for q in quarters:
        print(q["start"], q["end"], q["value"] / Decimal("100000000"), LABELS[args.lang]["unit"], "; ".join(q["sources"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(chart_svg(quarters, lang=args.lang), encoding="utf-8")
    print("Saved:", args.output)
