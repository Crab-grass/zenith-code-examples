# Diversity metrics across a Japanese corporate group, in Node.js

Code for the Qiita article *ZENITH Code Deep Dive #11* (Japanese): does the reporting company's (the filing parent, standalone) diversity figure describe the group? It reads `/stable/diversity` for five electronics companies (Hitachi, Mitsubishi Electric, NEC, Fujitsu, Sony Group; fiscal period `2026-03`) and prints, for the female manager ratio, male childcare leave and the gender pay gap, the parent's value next to the subsidiaries listed in the same table of the annual report: how many have a value, minimum, median, maximum, how many are 0%, how many are `null` and how many are above 100%.

## Run (no account, no network)

Requires Node.js 18+. No packages to install. The saved responses in [`data/`](data) are read as they are:

```sh
cd articles/qiita-deep11
node diversity-sample.mjs --from-json ./data
node diversity-sample.mjs --from-json ./data --sort-by-gap   # display-only change: parent minus subsidiary median, descending
```

The output is [`expected-output.txt`](expected-output.txt) and [`expected-output-sort-by-gap.txt`](expected-output-sort-by-gap.txt), the same text as in the article (the tests compare them). Labels are Japanese, as in the article.

## Run against the live API

Needs a [ZENITH Code API key](https://zenithcode.net/en/sign-up) (Free plan available).

```sh
export ZENITH_API_KEY=...        # keep it out of your shell history and repositories
node diversity-sample.mjs --period 2026-03              # the five companies above
node diversity-sample.mjs 7203 7974                     # your own symbols, latest filing
```

One request (1 token) per company, 6.5 seconds apart to stay under the Free plan's 10 requests per minute. Without `--period` the latest filing is returned. An HTTP error such as 429 stops the run; nothing is retried.

## What to watch for

- The response is an **array**; the script takes the first element. Ratios are fractions (`0.089` = 8.9%) and are printed with `toFixed(1)`.
- `reportingCompany` is the filing parent only. `subsidiaries` lists the companies in the filing's diversity table, which is **not the total number of consolidated subsidiaries**.
- `0` and `null` mean different things: `0.0` in the filing is `0`, `－` (for example, no employee in scope) is `null`. Nulls are counted separately and never treated as 0%, and each field shows "with a value / listed" (`子(62/64, null 2)`). A field with no value at all (Nintendo's subsidiaries' female manager ratio) prints `—` instead of failing.
- Male childcare leave above 100% is a valid result of the statutory formula (leave taken this year for children born earlier), and a pay gap above 100% means women's average pay is higher in that category. Neither is capped or dropped.
- The parent's basis for male childcare leave is `maleChildcareLeaveBasis` (`childcare-leave` or `childcare-leave-and-purpose-leave`); for subsidiaries it is `null`, so check the notes in the filing before comparing subsidiaries.
- `HTTP 404`, `200 with an empty array` and a `null` field are different situations. When the data was retrieved, `8951` and `9399` returned HTTP 404.
- `docId` and `sourceUrl` point to the original filing on EDINET. Check numbers there.

## Tests

`node --test tests/*.test.mjs` from the repository root runs [`tests/qiita-deep11.test.mjs`](../../tests/qiita-deep11.test.mjs): synthetic fixtures for null vs. 0, odd and even medians, values above 100%, a field with no values, 404 vs. empty 200, rate-limit stops and `--sort-by-gap`, plus a replay of the saved snapshot against the expected output files.

The saved responses in `data/` were retrieved from `/stable/diversity` at 19:07 JST on 2026-11-27 (fiscal period `2026-03`, filings submitted in June 2026). They contain no stock prices or API keys. Code is MIT-licensed; that does not grant rights to API data. Keep live responses for your own use under the [terms](https://zenithcode.net/en/terms).

Data provided by ZENITH Code (sources: EDINET and company disclosures; processed by ZENITH Code). ZENITH Code does not warrant the accuracy, completeness or timeliness of the data, and nothing here is investment advice.

日本語: [README.ja.md](README.ja.md)
