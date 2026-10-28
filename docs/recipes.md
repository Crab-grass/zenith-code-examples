# Recipes

[日本語](recipes.ja.md) · [README](../README.md) · [Library guide](library.md) · [Guide for international developers](japan-financial-data.md)

Short answers to common analysis tasks. Every recipe runs first with `--demo` (fictional companies `DEMOA`, `DEMOB`, `DEMOC`, no key, no network). Replace `--demo` and the demo code with a real securities code once you have an [API key](https://zenithcode.net/en/sign-up). Run from the repository root with Python 3.9+; `node javascript/zenith-examples.mjs` accepts the same commands.

Add `--cache output/cache` to real-data commands while you experiment: repeated requests within 24 hours reuse the saved response and use no quota.

## Find a company's securities code

```sh
python3 python/zenith_examples.py search --query motors --demo
python3 python/zenith_examples.py search --query Toyota
```

English and Japanese names both work. Keep codes as strings (`130A` is valid).

## Get a one-page company report

```sh
python3 python/report.py --symbol DEMOA --demo --out output/report-demo
python3 python/report.py --symbol 7203 --cache output/cache --out output/report-7203
```

`output/report-7203/report.md` covers annual trend, standalone quarters, financial health, sector position and dividends, with SVG charts and the document IDs behind the numbers. Add `--lang ja` for Japanese. About 10 requests / 19 tokens with real data.

## Chart five years of revenue and operating margin

```sh
mkdir -p output
python3 python/zenith_examples.py trend --symbol DEMOB --demo > output/trend.json
python3 python/chart_svg.py output/trend.json -o output/trend.svg
```

The margin is recalculated from yen amounts and checked against the API value (`marginCheck`). Missing revenue is drawn as a gap, not zero.

## Compare two companies fairly

```sh
python3 python/zenith_examples.py compare --symbols DEMOA,DEMOB --demo
python3 python/zenith_examples.py compare --symbols DEMOA,DEMOC --demo
```

Only fiscal years shared by every company are compared. Read `notes`: the first example reports different accounting standards; the second has no shared year (March versus December year-end) and says so instead of pairing different periods.

## Analyse quarter by quarter

```sh
python3 python/zenith_examples.py quarters --symbol DEMOA --demo --csv output/quarters.csv
```

Japanese Q2 and Q3 figures are year-to-date; `quarters` converts them to standalone quarters and leaves a reasoned gap (`status`) when it cannot.

## Check balance-sheet strength and cash generation

```sh
python3 python/zenith_examples.py health --symbol DEMOC --demo
```

Equity ratio, current ratio, debt-to-equity, net debt and free cash flow by year. Flags such as `negativeFreeCashFlow` describe the numbers; they are not a rating.

## See where valuation and profitability sit in the sector

```sh
python3 python/zenith_examples.py benchmark --symbol DEMOA --demo
python3 python/zenith_examples.py peers --symbol DEMOA --demo
```

`benchmark` gives the quartile position within the TSE 33-sector statistics; `peers` lists same-sector companies of similar size and the sector median.

## Open statements in a spreadsheet

```sh
python3 python/zenith_examples.py statements --symbol DEMOB --years 5 --demo --csv output/statements.csv
```

One table: a row per line item, a column per fiscal year, with accounting standard and document ID at the top of each statement. UTF-8 with BOM so Excel detects the encoding; empty cells mean not disclosed.

## Watch upcoming earnings for a list of companies

```sh
python3 python/zenith_examples.py earnings --from 2025-04-01 --to 2025-06-30 --symbols DEMOA,DEMOB --demo
```

Ranges are at most 93 days. Reported rows include EPS and the surprise against the estimate.

## Review dividend history

```sh
python3 python/zenith_examples.py dividends --symbol DEMOA --demo --csv output/dividends.csv
```

Annual totals (`dividendType: annual`) and individual payments are separate rows; do not add them together. `forecastOrActual` separates company forecasts from paid dividends.

## Use the results in pandas or Jupyter

See the [library guide](library.md). In short:

```python
import sys; sys.path.insert(0, "python")
import pandas as pd
from zenith_examples import demo_requester, run_example
df = pd.DataFrame(run_example("health", "DEMOC", "demo", requester=demo_requester)["health"])
```

## Ask an AI assistant instead

Connect the [remote MCP server](mcp.md) and ask in plain language, for example "Compare the operating margins of 7203 and 7267 for the fiscal years they share." REST and MCP use the same quota.

---

Results are for your own analysis and are not investment advice. Stock prices and TDnet documents must not be shown to third parties; see [display rights](https://zenithcode.net/en/docs/display-rights).
