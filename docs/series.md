# Article-to-code map (Qiita series)

[日本語](series.ja.md) · [README](../README.md)

Crabgrass publishes Japanese tutorial series on Qiita. The articles explain concepts and steps; this repository holds **code you can run locally and tests that check it**. You can start from the "In this repository" column without reading the articles.

[Article list on Qiita (Japanese)](https://qiita.com/Sohei-Taniguchi-CG)

## Where to start

| Goal | Start here | Account |
| --- | --- | --- |
| Understand filings and XBRL | TDnet 1 → 4, then EDINET 1 → 4 | Not required |
| Build a chart right away | [TDnet lessons 3 and 4](learning.md) | Not required |
| Chart one company's results and margin with real data | [Practice lessons 1–2](../practice/README.md) | Required |
| Compare companies under matching conditions | `compare` ([README](../README.md#examples)) | Required |
| Build your own analysis page | [Company analysis template](../templates/company-analysis/README.md) | Not required for sample data |

## TDnet analysis (4 articles)

Earnings releases, timely disclosure and Inline XBRL.

| # | Topic | In this repository |
| --- | --- | --- |
| 1 | [What TDnet is; earnings releases versus EDINET](https://qiita.com/Sohei-Taniguchi-CG/items/9b1b92036b5453b7cc72) | Reading only |
| 2 | [XBRL in earnings releases: PDF versus data](https://qiita.com/Sohei-Taniguchi-CG/items/7e31c7c1720b5f7872f8) | Inspect the elements in the [small Inline XBRL fixture](../learning/tdnet-sales.xhtml) |
| 3 | [Check period, unit and missing values before comparing](https://qiita.com/Sohei-Taniguchi-CG/items/2aa5bed0da189682529c) | `python3 python/learn_tdnet.py` ([guide](learning.md)) |
| 4 | [Separate cumulative, standalone, actual and forecast values](https://qiita.com/Sohei-Taniguchi-CG/items/6d8e3a83dc82e115ff57) | `python3 python/quarterly_chart.py` ([guide](learning.md)) |

## EDINET analysis (4 articles)

Annual securities reports, taxonomies and statement hierarchies.

| # | Topic | In this repository |
| --- | --- | --- |
| 1 | [What EDINET is; reading annual securities reports](https://qiita.com/Sohei-Taniguchi-CG/items/b3c1c0f7ddb85764aa13) | Reading only |
| 2 | [Report structure and XBRL tags](https://qiita.com/Sohei-Taniguchi-CG/items/66963590299e01f32990) | `full` returns all line items with their hierarchy |
| 3 | [Files, tags and contexts compared with TDnet](https://qiita.com/Sohei-Taniguchi-CG/items/7227bc4f051fa88ea5d1) | Compare with the TDnet lesson 3 fixture |
| 4 | [Using financial data for ongoing analysis](https://qiita.com/Sohei-Taniguchi-CG/items/7f43d854ac8f3c15165d) | `trend --csv` keeps retrieval time and document ID on every row |

## ZENITH Code practice (8 lessons)

Build a personal company analysis page showing trends, operating margin, peer comparison and sources. Articles are being published on Qiita in order.

| # | Topic | In this repository |
| --- | --- | --- |
| 1 | [Fetch and chart revenue and operating income](https://qiita.com/Sohei-Taniguchi-CG/items/b9b8b1580ba30b6b06c3) (Japanese) | [practice01_fetch.py, practice01_plot.py](../practice/README.md) |
| 2 | [Calculate operating margin and check it against the API](https://qiita.com/Sohei-Taniguchi-CG/items/0b2d22511a6cddf5ae7d) (Japanese) | [practice02_margin.py](../practice/README.md) |
| 3 | [Align conditions before comparing two companies](https://qiita.com/Sohei-Taniguchi-CG/items/c74edd2c330a69bc9dac) (Japanese) | `compare --symbols 7203,7267` reports shared periods and differing standards or period lengths |
| 4 | [Build an analysis page that switches companies and metrics](https://qiita.com/Sohei-Taniguchi-CG/items/f7f1fd4582ece2e4409a) (Japanese) | Start the [company analysis template](../templates/company-analysis/README.md) with fictional data |
| 5 | Link the financial table to its sources | The template's financial table and provenance view |
| 6 | Fiscal periods and year-on-year change | The template's period selection and year-on-year change |
| 7 | Spacing, colours and content | The template's three styles |
| 8 | Switch from sample to real data | The template's live mode (the key stays in your local server) |

The code in the `practice` folder is the same as the code printed in lessons 1–2 and is updated if the articles change.

## Going further

- **Everything at once**: `python3 python/report.py --symbol <code> --out output/report` writes a one-page report with charts. See the [recipes](recipes.md) for task-by-task commands.
- **Same analysis for another company**: `trend --symbol <code>` calculates and checks margins and writes CSV without editing the article code.
- **Use an AI assistant**: [MCP guide](mcp.md), [start with an agent](agent-start.md).
- **Choose fields**: [Choosing a financial data API](https://zenithcode.net/learn/financial-data-api-selection) (Japanese), [API docs](https://zenithcode.net/en/docs).

Data you retrieve is subject to the conditions summarized in the [README](../README.md#code-licence-and-data-rights-are-different). These examples are not investment advice.
