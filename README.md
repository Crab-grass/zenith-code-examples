# ZENITH Code examples

[![ZENITH Code service overview: Japanese earnings, prices and filings, with coverage figures.](assets/zenith-code-overview.webp)](https://zenithcode.net/en)

Service screenshot as of 2026-10-26. Select the image to visit the website.

**Japanese stock prices and company financials, through one API.**

[日本語](README.ja.md) · [Website](https://zenithcode.net/en) · [API docs](https://zenithcode.net/en/docs) · [Get an API key](https://zenithcode.net/en/sign-up) · [Business enquiries](https://zenithcode.net/en/contact-sales)

Official, runnable Python and JavaScript examples from Crabgrass Inc., the operator of [ZENITH Code](https://zenithcode.net/en).

ZENITH Code provides Japanese end-of-day stock prices under formal exchange agreements, alongside normalized company financials and as-reported financial statement hierarchies. Use the same securities code and API key to retrieve prices and financials for your own analysis. Prices are **end-of-day, not real-time**.

## Choose your starting point

| Goal | Start here | Account |
| --- | --- | --- |
| Read a financial fact and build a chart | [TDnet lessons 3 and 4](docs/learning.md) | No account or extra packages |
| Retrieve real prices and financials | **[Create an account and get an API key →](https://zenithcode.net/en/sign-up)** | Required |
| Ask an agent to help with setup | [Copyable prompt and setup guide](docs/agent-start.md) | Required for real data |

### Build this before signing up

![Synthetic cumulative sales of 20, 45 and 72 versus standalone quarters of 20, 25 and 27, in JPY 100 million.](assets/quarterly-sales.en.svg)

**A runnable example using fictional data.** Follow the [code and explanation](docs/learning.md) to read periods and units, then generate this chart. For real data, use the API examples below.

### Learn on the service website

Start with TDnet, then continue to EDINET. These guides are currently in Japanese.

1. [TDnet XBRL analysis guide](https://zenithcode.net/learn/tdnet-xbrl): earnings releases, periods and units.
2. [EDINET XBRL analysis guide](https://zenithcode.net/learn/edinet-xbrl): statutory filings, taxonomies and statement hierarchies.
3. [Choosing a financial data API](https://zenithcode.net/learn/financial-data-api-selection): deciding what to parse yourself and where to use an API.

## Start here: real data

1. Create a [ZENITH Code account](https://zenithcode.net/en/sign-up), review and accept the applicable data terms, and create an API key in your dashboard. A Free plan is available; check [current pricing and access](https://zenithcode.net/en/pricing).
2. Clone this repository:

```sh
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples
```

3. Run the first example with **Python 3.9+**. No packages to install. The terminal prompts for your API key without displaying it:

```sh
python3 python/zenith_examples.py snapshot --symbol 7203
```

This makes two requests: the latest trading-day close and up to three annual income statements for Toyota Motor (`7203`). The output preserves the price date, financial periods, accounting standards, nulls, and financial provenance. It does not assume that the latest price and a fiscal-year statement describe the same period, or compute valuation ratios from mismatched dates.

**Run examples locally.** They print data for your private use. Do not put live price responses, TDnet documents/links, API keys, or screenshots of restricted data in public repositories, issues, notebooks, or CI logs. This repository contains code, not a downloadable market dataset.

## Examples

Both implementations support the same commands:

| Command | What you get | Requests / API tokens* |
| --- | --- | --- |
| `snapshot` | Latest close + up to three annual income statements | 2 / 2 |
| `history` | Daily OHLCV and adjusted close for a specified range | 1 / 10 |
| `financials` | Up to three annual income statements with provenance | 1 / 1 |
| `full` | Latest full-year as-reported statements, including hierarchy | 1 / 10 |

*Checked against the public OpenAPI specification on 2026-10-25. API tokens are service quota units, not LLM tokens. Current plan permissions and limits apply. An empty result is kept as an empty array, not invented data. API usage may consume your plan's included quota. These examples do not purchase extra tokens or retry automatically.

### Python

```sh
python3 python/zenith_examples.py financials --symbol 6758
python3 python/zenith_examples.py history --symbol 7203 --from 2026-09-01 --to 2026-09-30
python3 python/zenith_examples.py full --symbol 7203
```

If `ZENITH_API_KEY` is already set, the script uses it instead of prompting.

### JavaScript / Node.js

Requires **Node.js 22+**. No npm dependencies. In a Bash or zsh terminal, enter your key without storing it in a shell command:

```sh
printf 'ZENITH API key (hidden): '
read -r -s ZENITH_API_KEY
printf '\n'
export ZENITH_API_KEY
node javascript/zenith-examples.mjs snapshot --symbol 7203
```

```sh
node javascript/zenith-examples.mjs financials --symbol 6758
node javascript/zenith-examples.mjs history --symbol 7203 --from 2026-09-01 --to 2026-09-30
node javascript/zenith-examples.mjs full --symbol 7203
unset ZENITH_API_KEY
```

Use these as local/server-side examples. Do not embed your API key in browser JavaScript. On other shells, set `ZENITH_API_KEY` using your environment's secure configuration. `.env` files are ignored by Git but are **not automatically loaded** by these scripts.

## Understand the data

- `priceDate` is the quote date; `retrievedAt` is when you made the request. These are different.
- Financial amounts are in JPY. Ratios such as operating margin are fractions: `0.12` means 12%.
- `null` is not zero. Coverage differs by company, period, and accounting standard.
- Annual financials are requested explicitly. If adapting the examples to quarterly statements, check cumulative-versus-standalone period semantics.
- Historical prices include `close` and `adjustedClose`. Choose the appropriate series for your analysis.
- The history example limits each request to 365 days to keep output manageable; the API has its own documented range limits.
- Corrected current financials are not automatically a point-in-time dataset for backtesting. Review publication dates and correction handling before historical simulations.
- Preserve provenance when adapting the financial examples. Any third-party display must also respect source-specific restrictions.

[Data quality](https://zenithcode.net/en/data-quality) · [Metric definitions](https://zenithcode.net/en/docs/metrics) · [OpenAPI](https://api.zenithcode.net/openapi.json)

## Connect an AI assistant

Use the remote MCP endpoint:

```text
https://mcp.zenithcode.net/mcp
```

See [the MCP guide](docs/mcp.md) for connection steps and prompts. REST and MCP use the same service quota; your AI application's own subscription or model charges are separate.

## Code licence and data rights are different

The example **code** is MIT-licensed. That licence does not grant rights to API data, documents, trademarks, or third-party content.

Stock prices and TDnet documents, including restricted document links, are subject to exchange-data restrictions. Under the currently published terms, these must not be displayed or redistributed to third parties, including through an AI response, on any plan. Registered-user and applicable consent requirements still apply inside an organization. Other data may be displayed in your service under Business or Enterprise, subject to the applicable conditions; redistribution of data requires separate written permission/contract terms.

Read [display rights](https://zenithcode.net/en/docs/display-rights), [data sources and conditions](https://zenithcode.net/en/legal/data-sources), and the [terms](https://zenithcode.net/en/terms). Those terms govern API use; this README is only a summary. These examples are not investment advice.

## Troubleshooting

| Result | Next step |
| --- | --- |
| `401` | Check your API key; do not post it in an issue. |
| `403` | Check key status, plan access and accepted data terms in your dashboard. |
| `429` | Check rate/quota limits; wait or review your plan rather than retrying in a loop. |
| Empty array | Check the requested company's coverage and period. |
| Timeout or network error | Check connectivity and service availability before trying again. |

## Tests and contributions

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

Tests use synthetic responses and make no live API calls. CI needs no API secrets. Contributions should also use synthetic fixtures; never include real account information or market-data exports. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Building with Japanese company data?

Send us your use case, target companies and required data fields. We can discuss coverage, appropriate plans and usage conditions.

- [Business enquiries](https://zenithcode.net/en/contact-sales) / [contact@zenithcode.net](mailto:contact@zenithcode.net)
- [Documentation](https://zenithcode.net/en/docs) / [Cookbook](https://zenithcode.net/en/docs/cookbook)
- [Security reporting](SECURITY.md)
