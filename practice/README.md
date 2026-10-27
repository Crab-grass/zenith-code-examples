# Practice code (Qiita "ZENITH Code実践" 1–2)

[日本語](README.ja.md) · [Article-to-code map](../docs/series.md) · [README](../README.md)

The complete Python programs published in the Japanese Qiita series "ZENITH Code実践" (practical lessons), ready to run. You can run them and check the results from this page alone.

| File | Lesson | What it does | Requests |
| --- | --- | --- | --- |
| [practice01_fetch.py](practice01_fetch.py) | 1 | Fetches annual income statements for Toyota Motor (7203) and saves `toyota-income.json` | 1 / 1 API token* |
| [practice01_plot.py](practice01_plot.py) | 1 | Selects FY March 2021–2025 from the saved JSON and writes a revenue/operating-income chart (PNG) and CSV | None |
| [practice02_margin.py](practice02_margin.py) | 2 | Calculates operating margin, checks it against the API's `operatingMargin`, and writes a chart and CSV | None |

*Checked against the public OpenAPI specification on 2026-10-27. Current plans and quotas apply.

## Run

You need **Python 3.9+** and Matplotlib. [Sign up](https://zenithcode.net/en/sign-up), then create a key on the [API keys page](https://zenithcode.net/en/api-keys).

macOS / Linux:

```sh
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples/practice
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python practice01_fetch.py
python practice01_plot.py
python practice02_margin.py
```

Windows (PowerShell):

```powershell
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples\practice
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe practice01_fetch.py
.\.venv\Scripts\python.exe practice01_plot.py
.\.venv\Scripts\python.exe practice02_margin.py
```

At `API key (hidden):`, type your key and press Enter; nothing is shown while you type. `ZENITH_API_KEY` is used if set. `.env` is not read. Only `practice01_fetch.py` calls the API, so you can re-run the plotting scripts without using quota.

Chart titles and notes are Japanese when a Japanese font is available and English otherwise. Program messages are in Japanese, as in the articles.

## Outputs

| File | Contents |
| --- | --- |
| `toyota-income.json` | The API response plus `retrievedAt` and the request URL. The API key is not saved |
| `toyota-income.png` / `.csv` | Revenue and operating income. Chart in JPY trillion, CSV in JPY |
| `toyota-margin.png` / `.csv` | Operating margin with calculated value, API value, check result (`match` / `missing` / `mismatch`), document ID and retrieval time |

These files contain real data. **Do not publish them.** They are ignored by Git in this folder.

## Other companies

The article code fixes company, period and accounting standard (7203, FY March 2021–2025, IFRS) so the text and charts match.

- **Without editing code**: from the repository root, run `trend`. It needs no Matplotlib and calculates and checks margins and can write CSV:

  ```sh
  python3 python/zenith_examples.py trend --symbol 6758 --years 5 --csv output/trend-6758.csv
  ```

- **Adapting the article code**: change `symbol` in the URL in `practice01_fetch.py`, plus `TARGETS` and the `("7203", "FY", "ifrs")` condition in `practice01_plot.py`. Non-March year ends also change the month in `TARGETS`.

To put companies side by side, use `compare`, which reports differing conditions first. See the [README](../README.md#examples).

Tests (synthetic values, no network): `python3 -m unittest tests.test_practice` from the repository root. Chart tests are skipped without Matplotlib.
