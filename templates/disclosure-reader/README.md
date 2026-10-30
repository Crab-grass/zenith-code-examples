# Disclosure reader (annual-report text, shareholders and strategic holdings, side by side)

[日本語](README.ja.md) · [Repository README](../../README.md)

A sample workspace for strategy, IR and research teams that reads **the deeper parts of the annual securities report (有価証券報告書) for 2–5 companies side by side**: how risks are written, who the shareholders are, how strategic holdings are being unwound, audit fees and main customers.

| View | What it does |
| --- | --- |
| 1. Read the text | Lines up the **headings** of business risks, management policy, R&D, capital expenditure and audit sections in one column per company. Highlights which headings mention a keyword (e.g. 為替 FX, サイバー cyber, 人材 people); click a heading to read its text on the right. Copies a prompt for an AI assistant containing the headings and sources only |
| 2. Shareholders | Top-10 shareholders (shared holders and compared companies marked), a 100% bar of shareholding by category, the latest large-shareholding reports (identical rows merged) |
| 3. Strategic holdings | How many companies' shares are held for purposes other than pure investment, itemized holdings with year-on-year change, **holdings sold out during the year**, deemed holdings, holdings of subsidiaries and **mutual holdings** between the compared companies |
| 4. Audit & customers | Audit, non-audit and network fees with the non-audit share; customers that account for 10% or more of revenue, with their share of revenue |

## 1. Try it without an account

You need **Python 3.9+ and a browser**. No packages, no build step.

```sh
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples
python3 templates/disclosure-reader/server.py
```

Open **http://127.0.0.1:8790** and stop with **Ctrl+C**. Use `--port 8791` if the port is taken.

The snapshot is **real ZENITH Code data saved on the date shown on screen** (Toyota, Denso, Honda, Mazda and TEIN). It is not the latest filing. The snapshot makes no API calls and needs no account.

- Choose 2–5 companies at the top and switch between the four views on the left.
- Switch JA / EN and light / dark (the default follows your OS).
- Link to a selection and view with `?companies=7203,7261#cross`.

Report text, headings and holder names are shown in Japanese, as filed.

## 2. Connect live data

[Create an account](https://zenithcode.net/en/sign-up), accept the applicable terms and data conditions, and create an API key in the dashboard. Then restart with:

```sh
python3 templates/disclosure-reader/server.py --live
```

Enter the key at the hidden terminal prompt, or set `ZENITH_API_KEY`. `.env` files are not read automatically. **The key is never sent to the browser; only the local Python process holds it.**

Choose **Live**, add 2–5 securities codes and press **Fetch**.

| API per company | Requests |
| --- | --- |
| `/stable/profile` (company name only) | 1 |
| `/stable/text-blocks?tag=risks`, `policy`, `rnd`, `capex`, `audits` | 5 |
| `/stable/major-shareholders` | 1 |
| `/stable/shareholder-categories` | 1 |
| `/stable/large-holders` | 1 |
| `/stable/cross-shareholdings` | 1 |
| `/stable/audit-fees` | 1 |
| `/stable/main-customers` | 1 |
| `/stable/income-statement?period=annual&limit=3` (only when main customers exist; revenue and period only) | 0–1 |

**A fetch = 12–13 requests per company**, at most 65 for five companies, one company at a time, never in parallel. A 404 (the disclosure does not exist) counts as "none"; any other failure stops the whole fetch and nothing partial is shown. No retries, no auto refresh. Switching views, keywords and copying the prompt make no API calls.

## What reaches the browser

The local server forwards only the fields the views need (the whitelists in `server.py`).

- **No share prices or price-based ratios.** Price, market capitalisation, PER, PBR, dividend yield and similar fields from `/profile` are removed; only the names are kept.
- **No carrying amounts of strategic holdings** (`carryingAmount`, `priorCarryingAmount`). Listed shares are carried at market value, so the amounts are set by share prices. Only share counts, the stated purpose and whether the other company holds back are used.
- **Only revenue and its period from the income statement**, to express main customers as a share of revenue.
- **No TDnet document links.** `archiveUrl` is always removed and `sourceUrl` survives only for EDINET pages. Document IDs and filing dates are shown.
- Shareholder addresses are reduced to the **prefecture (or “overseas”)** before they are forwarded.
- Upstream error details are never shown.

## Reading notes

- **Headings** come from line markers such as （１）, ①, 1., ⅰ), a., 【…】, ＜…＞ and ■ (`extractHeadings` in `model.mjs`). The first marker used is the top level; a new marker inside it is one level down. Labels repeated three or more times (such as ＜リスク＞ ＜対応策＞) and lines that end a sentence (。) are not headings.
- **Character counts** are of the text received, not the API's `chars`. Tables arrive flattened into lines, so the count is not the document's length.
- Companies without the section (ETFs, REITs) show “No such section”.
- **Shared shareholders** are matched by name after unifying ㈱ / 株式会社, （相）, trust-account suffixes (信託口) and full-/half-width forms.
- **Large-shareholding reports** with the same holder, shares and ratio are merged; the newest five are shown.
- **Itemized holdings are only what is disclosed.** Banks and others list up to 60, so fewer rows than holdings is not an error. Rows with prior-year shares only are counted as sold out during the year. Mutual holdings are found by matching the holding's name with the compared companies' names.
- **Audit fees**: without subsidiaries the API leaves the total empty, so the parent's fee is the total. The non-audit share = non-audit ÷ (audit + non-audit), calculated here; no non-audit work means 0%.
- **Main customers** are divided by annual revenue for the same fiscal year; prior-year rows only when revenue 12 months earlier is available. A share above 100% means the unit may not match the filing, so neither amount nor share is shown. A 404 means no customer reaches 10% of revenue.
- “—” means unavailable or not disclosed and is never treated as zero.

## The AI prompt

**Copy a prompt for an AI assistant** (view 1) copies the section name, each company's headings (★ where the keyword appears) and the sources (document ID, filing date, EDINET URL) with instructions. **The report text itself is never copied**; have the assistant check the EDINET original, or read it yourself.

## Refresh the snapshot

`demo.json` is the exact output of `fetch_bundle` in `server.py`, the same function live mode uses.

```sh
python3 templates/disclosure-reader/build_demo.py              # 7203 6902 7267 7261 7217
python3 templates/disclosure-reader/build_demo.py 6758 6752    # your own selection
```

Provide the key with `ZENITH_API_KEY` or the hidden prompt, never on the command line. The file is replaced only when every request succeeds, after a last check that no prices, carrying amounts or TDnet links are included.

## Customize

| File | Role |
| --- | --- |
| `server.py` | Loopback-only server, field whitelists, `fetch_bundle` |
| `build_demo.py` | Builds `demo.json` from live data |
| `model.mjs` | Validation, heading extraction, keywords, name matching, mutual holdings, sold-out counting, audit fees, customer shares (shared with the Node tests) |
| `app.mjs` | The four views (the `VIEWS` list) and company selection |
| `i18n.mjs` | Japanese and English copy |
| `index.html` / `style.css` | Layout, light and dark themes |
| `demo.json` | Saved snapshot for offline use |

To read another section, add it to `SECTIONS` in `server.py` and `model.mjs` and add `sec_<name>` to `i18n.mjs` (one more request per company).

The browser cannot make the server fetch arbitrary URLs. The server checks Host, Origin and a per-start token, and runs one live fetch at a time. **This is a single-user local template**, not meant to be exposed to the internet or shared by several users.

The code is MIT-licensed; that grants no rights to API data. Follow the [display rules](https://zenithcode.net/en/docs/display-rights) and [terms](https://zenithcode.net/en/terms) when sharing screens or copied text.
