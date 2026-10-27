# ライブラリとして使う（pandas・Jupyter・Node.js）

[English](library.md) · [README](../README.ja.md)

コマンドの中身は、読み込んで使える関数です。以下の例は同梱の架空データで、通信なしに動きます。実データにするには引数を1つ変えるだけです。

## Python

関数自体は追加パッケージ不要です。pandasは任意です（`python3 -m pip install pandas`）。

```python
import os
import sys
sys.path.insert(0, "python")  # リポジトリのルートで実行

from zenith_examples import demo_requester, run_example, table_rows

# 架空データ（DEMOA・DEMOB・DEMOC）
trend = run_example("trend", "DEMOA", "demo", requester=demo_requester)

# 実データ
# trend = run_example("trend", "7203", os.environ["ZENITH_API_KEY"])
```

| 呼び出し | 返す内容 |
| --- | --- |
| `run_example("search", "", key, query="トヨタ")` | `companies`：証券コードと日英の社名 |
| `run_example("trend", code, key, years=5)` | `annualTrend`：売上高・営業利益・計算した利益率と照合結果（古い順） |
| `run_example("compare", "", key, symbols="7203,7267")` | `companies`・`commonFiscalPeriods`・`notes` |
| `run_example("statements", code, key, years=3)` | `incomeStatements`・`balanceSheets`・`cashFlows` |
| `run_example("metrics", code, key, years=5)` | `annualMetrics`：ROE・ROA・利益率・EPS・BPS・PER・PBRなど |
| `run_example("peers", code, key, limit=10)` | `peers`：対象・同業他社・業種中央値 |

### pandas

```python
import pandas as pd

df = pd.DataFrame(trend["annualTrend"]).set_index("fiscalPeriod")

# 財務三表を「項目×決算期」の1つの表に
statements = run_example("statements", "DEMOB", "demo", requester=demo_requester)
fields, rows = table_rows(statements)
wide = pd.DataFrame(rows, columns=fields).set_index(["statement", "item"])
```

`null`は`None`／`NaN`になります。0で埋めないでください（未開示を意味します）。金額は円、比率は0〜1の小数です。

### グラフ

`python/chart_svg.py`で、`trend`・`compare`の結果から追加パッケージなしにSVGを作れます。`--lang ja`で日本語の見出しになります。

```sh
python3 python/zenith_examples.py trend --symbol DEMOB --demo > output/trend.json
python3 python/chart_svg.py output/trend.json -o output/trend.svg --lang ja
```

### Jupyter

ノートブックは出力結果をファイル内に保存します。実データを使ったノートブックを共有・コミットする前に出力を消去し、APIキーを書き込まないでください。

## JavaScript（Node.js 22以上）

```js
import { demoRequester, runExample, tableRows, toCsv } from './javascript/zenith-examples.mjs';

const metrics = await runExample('metrics', 'DEMOA', 'demo', undefined, undefined, demoRequester, { years: 3 });
console.table(metrics.annualMetrics.map(({ fiscalPeriod, roe, per, pbr }) => ({ fiscalPeriod, roe, per, pbr })));
const csv = toCsv(tableRows(metrics));
```

サーバー側・手元でのみ使い、ブラウザに配るコードへAPIキーを入れないでください。

## データの扱い

結果はご自身の分析に使ってください。株価そのもの（`metrics`の`closePrice`、`peers`の`price`・`changePctYtd`）とTDnetの書類は、どのプランでも第三者に表示できません。PER・PBR・ROE・利益率などの計算した指標は取引所データではありませんが、データを他の人に見せるにはBusiness以上のプランと所定の条件が必要です。[表示してよいデータ](https://zenithcode.net/docs/display-rights)を確認してください。
