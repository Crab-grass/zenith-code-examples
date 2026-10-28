# 実践編のコード（Qiita「ZENITH Code実践」①・②）

[English](README.md) · [連載とコードの対応表](../docs/series.ja.md) · [README](../README.ja.md)

Qiitaの連載「ZENITH Code実践」に全文を載せたPythonコードを、そのまま実行できる形で置いています。記事を読まなくても、このページだけで実行から結果の確認まで進められます。

| ファイル | 記事 | すること | API呼び出し |
| --- | --- | --- | --- |
| [practice01_fetch.py](practice01_fetch.py) | 実践① | トヨタ自動車（7203）の通期の損益計算書を取得し、`toyota-income.json`に保存 | 1回／1トークン* |
| [practice01_plot.py](practice01_plot.py) | 実践① | 保存したJSONから2021〜2025年3月期を選び、売上高・営業利益のグラフ（PNG）とCSVを作る | なし |
| [practice02_margin.py](practice02_margin.py) | 実践② | 営業利益率を計算し、APIの`operatingMargin`と照合してグラフとCSVを作る | なし |

*2026年10月27日の公開OpenAPI仕様で確認。最新のプラン・利用枠が適用されます。

## 実行手順

**Python 3.9以上**と、グラフ用のMatplotlibを使います。APIキーは[会員登録](https://zenithcode.net/sign-up)後、[APIキー画面](https://zenithcode.net/api-keys)で作ります。

macOS・Linux：

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

Windows（PowerShell）：

```powershell
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples\practice
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe practice01_fetch.py
.\.venv\Scripts\python.exe practice01_plot.py
.\.venv\Scripts\python.exe practice02_margin.py
```

`API key (hidden):`と表示されたらキーを入力してEnterを押します。入力中に文字が表示されないのは正常です。環境変数`ZENITH_API_KEY`があればそれを使います。`.env`は読み込みません。

APIを呼ぶのは`practice01_fetch.py`だけです。グラフの色や文字を変えて何度実行しても、利用枠は減りません。

## できるファイル

| ファイル | 中身 |
| --- | --- |
| `toyota-income.json` | APIの応答（決算期ごとの一覧）に、取得日時`retrievedAt`と呼び出したURLを付けたもの。APIキーは保存しません |
| `toyota-income.png`・`.csv` | 売上高・営業利益。図は兆円、CSVは円単位 |
| `toyota-margin.png`・`.csv` | 営業利益率。CSVに計算値・APIの値・照合結果（`match`／`missing`／`mismatch`）・書類ID・取得日時を残します |

これらのファイルは実データです。**公開リポジトリやIssueへ載せないでください。** このフォルダの出力は`.gitignore`で追跡対象外にしています。

## 結果の確かめ方

- 決算期・会計基準・通期のどれかが想定と違う、または金額が欠けている場合は、0で埋めずにエラーで止まります。
- `missing`はAPIの比率が無い期、`mismatch`は計算値とAPIの値が合わない期です。どちらも`match`へ書き換えません。
- 利益率どうしの差は「ポイント」です。前期比の変化率（%）とは別の数字になります。
- 値は取得時点のものです。訂正や更新で、後から同じ取得をしても変わる場合があります。

## 他の企業で試すには

記事のコードは、説明と図を一致させるため企業・期間・会計基準を固定しています（7203、2021〜2025年3月期、IFRS）。

- **コードを書き換えずに試す**：リポジトリのルートで`trend`コマンドを使います。Matplotlibは不要で、営業利益率の計算とAPIとの照合、CSV出力まで行います。

  ```sh
  python3 python/zenith_examples.py trend --symbol 6758 --years 5 --csv output/trend-6758.csv
  ```

- **記事のコードを改造する**：`practice01_fetch.py`のURLの`symbol`、`practice01_plot.py`の`TARGETS`（決算期）と`select_rows`内の条件`("7203", "FY", "ifrs")`を合わせて変えます。3月期以外の会社では`TARGETS`の月も変わります。

2社以上を並べる場合は、条件の違いを先に確かめる`compare`コマンドが使えます。使い方は[README](../README.ja.md#サンプル一覧)を参照してください。

## よくあるエラー

| 表示 | 確認すること |
| --- | --- |
| `No module named matplotlib` | 仮想環境を有効にしたか。`pip install`したPythonで実行しているか |
| `HTTP 401`・`403` | キーの入力間違い、キーの状態、データ利用条件への同意 |
| `HTTP 429` | 利用上限・レート制限。続けて実行しない |
| `FileNotFoundError` | `practice`フォルダで実行したか。先に`practice01_fetch.py`を実行したか |
| `対象年が不足しています` | 保存したJSONに2021〜2025年3月期があるか |
| `No module named practice01_plot` | `practice02_margin.py`を同じフォルダから実行しているか |

テスト（架空の値・通信なし）：リポジトリのルートで`python3 -m unittest tests.test_practice`。Matplotlibが無い環境では描画のテストを飛ばします。
