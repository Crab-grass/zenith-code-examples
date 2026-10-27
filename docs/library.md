# Use the examples as a library (pandas, Jupyter, Node.js)

[日本語](library.ja.md) · [README](../README.md) · [Guide for international developers](japan-financial-data.md)

The command-line examples are thin wrappers around functions you can import. Every snippet below runs offline with the bundled fictional demo data; switch to real data by changing one argument.

## Python

No installation is required for the functions themselves. pandas is optional (`python3 -m pip install pandas`).

```python
import os
import sys
sys.path.insert(0, "python")  # run from the repository root

from zenith_examples import demo_requester, request_rows, run_example, table_rows

# Offline demo: fictional companies DEMOA, DEMOB and DEMOC.
trend = run_example("trend", "DEMOA", "demo", requester=demo_requester)

# Real data: use your key and the default requester instead.
# trend = run_example("trend", "7203", os.environ["ZENITH_API_KEY"])
```

| Call | Returns |
| --- | --- |
| `run_example("search", "", key, query="Toyota")` | `companies`: codes with English and Japanese names |
| `run_example("trend", code, key, years=5)` | `annualTrend`: revenue, operating income, recalculated margin and check, oldest first |
| `run_example("compare", "", key, symbols="7203,7267")` | `companies`, `commonFiscalPeriods`, `notes` |
| `run_example("statements", code, key, years=3)` | `incomeStatements`, `balanceSheets`, `cashFlows` |
| `run_example("metrics", code, key, years=5)` | `annualMetrics`: ROE, ROA, margins, EPS, BPS, PER, PBR and more |
| `run_example("peers", code, key, limit=10)` | `peers`: target, same-sector peers, sector median |
| `run_example("quarters", code, key, years=2)` | `quarters`: standalone quarters derived from year-to-date figures, with `status` |
| `run_example("dividends", code, key, limit=40)` | `dividends`: annual totals and individual payments, forecasts and actuals |
| `run_example("earnings", "", key, "2026-11-01", "2026-11-30", symbols="7203")` | `earnings`: report dates and EPS surprise |

Wrap any requester with `cached(requester, "output/cache")` to reuse identical responses for 24 hours and save quota.

Every result has `retrievedAt`. Requests are not retried automatically.

### pandas

```python
import pandas as pd

df = pd.DataFrame(trend["annualTrend"]).set_index("fiscalPeriod")
df[["revenue", "operatingIncome", "calculatedMargin", "marginCheck"]]

# Income statement, balance sheet and cash flows as one table:
# one row per line item, one column per fiscal year.
statements = run_example("statements", "DEMOB", "demo", requester=demo_requester)
fields, rows = table_rows(statements)
wide = pd.DataFrame(rows, columns=fields).set_index(["statement", "item"])
wide.loc["incomeStatements"].head()
```

`null` becomes `None`/`NaN`. Keep it that way: missing means not disclosed, not zero. Amounts are full yen; ratios are 0–1 fractions.

### Charts

`python/chart_svg.py` draws an SVG from saved `trend` or `compare` output without extra packages:

```sh
python3 python/zenith_examples.py trend --symbol DEMOB --demo > output/trend.json
python3 python/chart_svg.py output/trend.json -o output/trend.svg
python3 python/chart_svg.py output/trend.json -o output/trend-ja.svg --lang ja
```

From Python, `chart_svg.render(trend)` returns the SVG text, which Jupyter can display with `IPython.display.SVG`.

### Jupyter

Notebooks store outputs inside the `.ipynb` file. Before committing or sharing a notebook that used real data, clear all outputs; never commit your API key. Keep the key in an environment variable or enter it with `getpass.getpass()`.

## JavaScript (Node.js 22+)

```js
import { demoRequester, runExample, tableRows, toCsv } from './javascript/zenith-examples.mjs';

const metrics = await runExample('metrics', 'DEMOA', 'demo', undefined, undefined, demoRequester, { years: 3 });
console.table(metrics.annualMetrics.map(({ fiscalPeriod, roe, per, pbr }) => ({ fiscalPeriod, roe, per, pbr })));

// Real data: runExample('metrics', '7203', process.env.ZENITH_API_KEY, undefined, undefined, undefined, { years: 3 })
const csv = toCsv(tableRows(metrics));
```

Run this server-side only. Never ship an API key in browser JavaScript.

## Data use

Results are for your own analysis. Stock prices themselves — `closePrice` in `metrics`, `price` and `changePctYtd` in `peers` — and TDnet documents must not be shown to third parties on any plan. Calculated metrics such as PER, PBR, ROE and margins are not exchange data, but showing any data to other people requires the Business plan or higher and its conditions. Read [display rights](https://zenithcode.net/en/docs/display-rights) before building anything other people will see.
