# Japanese company financials: a guide for international developers

[README](../README.md) · [日本語 README](../README.ja.md) · [API docs (English)](https://zenithcode.net/en/docs)

Japanese disclosures follow conventions that differ from US or European filings. This page lists the ones that most often break an analysis, and how they appear in ZENITH Code responses. Try the commands with `--demo` first: they use fictional companies and need no account.

```sh
python3 python/zenith_examples.py search --query motors --demo
python3 python/zenith_examples.py statements --symbol DEMOA --demo
python3 python/zenith_examples.py compare --symbols DEMOA,DEMOB --demo
```

## Find a company

Companies are identified by a **securities code**, not a ticker made of letters.

- Codes have four characters, such as `7203` (Toyota Motor) or `6758` (Sony Group). Since 2024, newly assigned codes can include a letter, such as `130A`. Keep codes as **strings**: never parse them as numbers.
- The API also accepts a `.T` suffix (`7203.T`), the form used by many international data vendors.
- Search by company name in English or Japanese: `search --query Toyota`. Results include `nameEn` and `nameJa`.

## Fiscal years

- Most listed Japanese companies end their fiscal year in **March**. Others end in December or another month.
- `fiscalPeriod` is the **year-end month** (`YYYY-MM`). `2025-03` is the fiscal year from April 2024 to March 2025.
- Companies label that year inconsistently in English: "FY2025", "FY2024" or "FY3/2025" can all mean the same year. In Japanese it is "2025年3月期". Use `fiscalPeriod` rather than labels.
- To compare a March company with a December company, decide and state your own pairing rule. `compare` lists only the periods that every company shares and never pairs different year-ends for you.
- `fiscalPeriodDays` exposes irregular periods, for example after a company changes its year-end. `compare` adds a note when lengths differ.

## Quarters are cumulative

`period` is `Q1`, `Q2`, `Q3` or `FY`. Income statement and cash-flow amounts for **Q2 and Q3 are year-to-date totals**, as published in Japan. Subtract the previous cumulative value to get a standalone quarter; check that both values come from the same fiscal year and basis. See the [TDnet lessons](learning.md) for a worked example with fictional data.

The examples request `period=annual` explicitly to avoid mixing quarters into annual trends.

## Accounting standards

Japanese companies report under **Japanese GAAP (JGAAP)**, **IFRS** or, for a few, **US GAAP**. `accountingStandard` gives the basis for each row (values are returned in lower case, such as `ifrs`). The API maps line items to the same field names across standards, but the definitions behind them can still differ. Check the standard before comparing margins across companies; `compare` notes when it differs.

## Line items specific to Japan

| Japanese | Reading | Usual English | API field | Note |
| --- | --- | --- | --- | --- |
| 売上高 | uriage-daka | Revenue / net sales | `revenue` | |
| 営業利益 | eigyō rieki | Operating income | `operatingIncome` | |
| 経常利益 | keijō rieki | Ordinary income (recurring profit) | `ordinaryIncome` | JGAAP subtotal: operating income plus non-operating income and expenses. Not presented under IFRS, so IFRS companies return `null` |
| 特別利益・特別損失 | tokubetsu rieki / sonshitsu | Extraordinary income / loss | `extraordinaryIncome`, `extraordinaryLoss` | JGAAP items below ordinary income; usually `null` for IFRS companies |
| 親会社株主に帰属する当期純利益 | — | Net income attributable to owners of the parent | `netIncome` | |
| 自己資本 | jiko shihon | Equity attributable to owners | `ownersEquity` | |
| 自己資本比率 | — | Equity ratio | `equityRatio` | A 0–1 fraction |
| 有利子負債 | — | Interest-bearing debt | `interestBearingDebt` | |

`null` means **not disclosed or not applicable**, never zero. The examples keep `null` and refuse to calculate ratios from missing values.

## Where the numbers come from

| Document | Japanese | Published via | Timing | Notes |
| --- | --- | --- | --- | --- |
| Earnings release | 決算短信 (*kessan tanshin*) | TDnet (Tokyo Stock Exchange) | Usually within about 45 days of period end | First, summary figures, includes company forecasts |
| Annual securities report | 有価証券報告書 (*yūka shōken hōkokusho*) | EDINET (Financial Services Agency) | Within three months of year end | Statutory filing with full statements |
| Half-year report | 半期報告書 | EDINET | After the first half | Since April 2024, Q1 and Q3 are covered by earnings releases rather than statutory quarterly reports |

ZENITH Code combines releases and statutory filings. Each row has `provenance` with `source` (`tdnet` or `edinet`), `docId` and `announcedAt`. Values can be revised after a correction; keep `retrievedAt` and `docId` with anything you save. `trend --csv` and `compare --csv` add both to every row.

Current data is not a point-in-time dataset. For backtests, check publication timing and corrections before assuming a value was known on a given date.

## Units, dates and currency

- Amounts are **full yen** (not thousands or millions of yen).
- Ratios such as `operatingMargin` are fractions: `0.12` means 12%.
- Disclosure times are in **Japan Standard Time (UTC+9)**. The examples record `retrievedAt` in UTC.
- Values are not converted to other currencies. If you convert, choose a rate that matches each period (period-end rate for balance sheets, period-average rate for flows), state it, and keep the yen value.
- Stock prices are end-of-day, not real-time.

## Data rights

Stock prices and TDnet documents cannot be displayed or redistributed to third parties under the currently published terms, on any plan. Other data can be displayed in your service under Business or Enterprise, subject to conditions. Read [display rights](https://zenithcode.net/en/docs/display-rights) and the [terms](https://zenithcode.net/en/terms) before building anything other people will see.

## Next steps

1. [Create an account and an API key](https://zenithcode.net/en/sign-up) (a Free plan is available).
2. Replace `--demo` with a real code: `search --query <name>`, then `statements --symbol <code>`.
3. Chart one company with the [practice code](../practice/README.md), or start the [company analysis template](../templates/company-analysis/README.md).
4. Use the API from an AI assistant with the [MCP guide](mcp.md).

This page summarizes common conventions for analysis code. It is not accounting or investment advice; check the company's own disclosures for authoritative definitions.
