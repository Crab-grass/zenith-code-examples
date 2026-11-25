# Reporting company vs. consolidated headcount from Japanese annual reports, in Node.js

Code for the Qiita article *ZENITH Code Deep Dive #10* (Japanese): how does the headcount the reporting company (the filing parent, standalone) discloses compare with the consolidated headcount, and what is the difference (consolidated minus reporting company)? It reads `/stable/workforce` for five electronics companies (Hitachi, Mitsubishi Electric, Fujitsu, NEC, Sony Group; fiscal period `2026-03`) and prints headcount, headcount by segment for the group and for the reporting company, and the parent-only average age, tenure and salary.

## Run (no account, no network)

Requires Node.js 18+. No packages to install. The saved responses in [`data/`](data) are read as they are:

```sh
cd articles/qiita-deep10
node workforce-sample.mjs --from-json ./data
node workforce-sample.mjs --from-json ./data --segments        # per segment: group headcount, reporting-company headcount, its share
node workforce-sample.mjs --from-json ./data --sort-by-share   # display-only change: share descending, 5% separator
```

The output is [`expected-output.txt`](expected-output.txt), [`expected-output-segments.txt`](expected-output-segments.txt) and [`expected-output-sort-by-share.txt`](expected-output-sort-by-share.txt), the same text as in the article (the tests compare them). Labels are Japanese, as in the article.

## Run against the live API

Needs a [ZENITH Code API key](https://zenithcode.net/en/sign-up) (Free plan available).

```sh
export ZENITH_API_KEY=...        # keep it out of your shell history and repositories
node workforce-sample.mjs --period 2026-03                    # the five companies above
node workforce-sample.mjs --period 2026-03 7203 7267 8951     # your own symbols
```

One request (1 token) per company, 6.5 seconds apart to stay under the Free plan's 10 requests per minute. Without `--period` the latest filing is returned. An HTTP error such as 429 stops the run; nothing is retried.

## What to watch for

- The response is an **array**; the script takes the first element.
- `employees`, `averageAge`, `averageTenureYears` and `averageAnnualSalary` describe the **reporting company only** (single entity), not the group. `consolidatedEmployees` is the group. Salary scope follows the notes in each filing (for example, NEC's filing, `S100YBFV`, note 3, excludes employees seconded out of and into the company from the salary average from this fiscal year).
- Segment sums leave out rows with `isSubtotal: true`. An empty array, a subtotal-only array, rows without numbers and a **partial sum** are reported as such (the difference and the largest segment show `—`), and a sum above the total is marked `原文を確認` ("check the original") rather than printed as if it matched. When either table's rows add up to more than its total, none of that company's segment shares (group or reporting company) is printed; they all show `原文を確認`.
- `parentSegments` is the breakdown of the reporting company by segment. It is joined to `segments` by segment name; a segment with no row on the reporting-company side shows `—` (not 0): Mitsubishi Electric's reporting-company table has no "Other" row, and Sony Group's has only "Corporate (Common)". When `parentSegments` is an empty array the script says the API response has no such rows and does not call it "no disclosure"; check the filing's tables.
- The 5% note (`※提出会社は連結の5%未満`) is this article's own display threshold, not an API or legal rule. Compare average salary only next to the reporting company's headcount and its share of the group.
- Rounding differs by company: Sony Group's filing (`S100YE2C`, section 5 "Employees", note 1) states the consolidated headcount rounded to the nearest hundred (94,900), so the 92,734 difference and its 97.7% share are derived from that rounded figure.
- `HTTP 404`, `200 with an empty array` and a `null` field are different situations and are never shown as 0. When the data was retrieved, `8951` and `9399` returned HTTP 404.
- `docId` and `sourceUrl` point to the original filing on EDINET. Check numbers there.

## Tests

`node --test tests/*.test.mjs` from the repository root runs [`tests/qiita-deep10.test.mjs`](../../tests/qiita-deep10.test.mjs): synthetic fixtures for subtotal rows, partial sums, sums above the total, the segment-by-segment join, null fields, 404 vs. empty 200, rate-limit stops, `--segments` and `--sort-by-share`, plus a replay of the saved snapshot against the expected output files.

The saved responses in `data/` were retrieved from `/stable/workforce` at 07:05 JST on 2026-11-26 (fiscal period `2026-03`, filings submitted in June 2026). They contain no stock prices or API keys. Code is MIT-licensed; that does not grant rights to API data. Keep live responses for your own use under the [terms](https://zenithcode.net/en/terms).

Data provided by ZENITH Code (sources: EDINET and company disclosures; processed by ZENITH Code). ZENITH Code does not warrant the accuracy, completeness or timeliness of the data, and nothing here is investment advice.

日本語: [README.ja.md](README.ja.md)
