# レシピ集

[English](recipes.md) · [README](../README.ja.md) · [ライブラリとして使う](library.ja.md)

よくある分析を、目的別の短い手順にまとめました。どれもまず`--demo`（架空の会社`DEMOA`・`DEMOB`・`DEMOC`。APIキー・通信なし）で試せます。[APIキー](https://zenithcode.net/sign-up)を用意したら、`--demo`を外して実際の証券コードに変えてください。リポジトリのルートで、Python 3.9以上で実行します。`node javascript/zenith-examples.mjs`でも同じコマンドが使えます。

試行錯誤するときは実データのコマンドに`--cache output/cache`を付けてください。24時間以内の同じ取得は保存した結果を使い、利用枠を消費しません。

## 社名から証券コードを探す

```sh
python3 python/zenith_examples.py search --query デモ --demo
python3 python/zenith_examples.py search --query トヨタ
```

## 1社分のレポートを作る

```sh
python3 python/report.py --symbol DEMOA --demo --out output/report-demo --lang ja
python3 python/report.py --symbol 7203 --cache output/cache --out output/report-7203 --lang ja
```

`report.md`に、通期の推移・四半期単独・財務の健全性・業種の中での位置・配当をまとめ、SVGのグラフと、数値の元になった書類IDを添えます。実データでは約10回の取得・19トークンです。

## 5年分の売上高と営業利益率をグラフにする

```sh
mkdir -p output
python3 python/zenith_examples.py trend --symbol DEMOB --demo > output/trend.json
python3 python/chart_svg.py output/trend.json -o output/trend.svg --lang ja
```

利益率は円の金額から計算し直し、APIの値と照合します（`marginCheck`）。欠損は0ではなく空白として描きます。

## 2社を条件をそろえて比べる

```sh
python3 python/zenith_examples.py compare --symbols DEMOA,DEMOB --demo
python3 python/zenith_examples.py compare --symbols DEMOA,DEMOC --demo
```

全社に共通する決算期だけを比べます。`notes`を読んでください。1つ目は会計基準の違いを、2つ目は共通の決算期が無いこと（3月決算と12月決算）を知らせます。

## 四半期ごとに見る

```sh
python3 python/zenith_examples.py quarters --symbol DEMOA --demo --csv output/quarters.csv
```

第2・第3四半期の累計値を単独の四半期に直します。直せない場合は空欄にし、`status`に理由を入れます。

## 財務の健全性とキャッシュ・フローを確かめる

```sh
python3 python/zenith_examples.py health --symbol DEMOC --demo
```

自己資本比率・流動比率・有利子負債比率・ネット有利子負債・フリー・キャッシュ・フローの推移です。`negativeFreeCashFlow`などの目印は数値の状態を示すもので、評価ではありません。

## 業種の中での位置を見る

```sh
python3 python/zenith_examples.py benchmark --symbol DEMOA --demo
python3 python/zenith_examples.py peers --symbol DEMOA --demo
```

`benchmark`は東証33業種の統計の四分位での位置、`peers`は同じ業種で規模の近い会社と業種中央値です。

## 財務三表を表計算ソフトで開く

```sh
python3 python/zenith_examples.py statements --symbol DEMOB --years 5 --demo --csv output/statements.csv
```

科目ごとの行・決算期ごとの列の1つの表で、各表の先頭に会計基準と書類IDが入ります。BOM付きUTF-8なのでExcelでも文字化けしません。空欄は未開示です。

## 気になる会社の決算発表日を確かめる

```sh
python3 python/zenith_examples.py earnings --from 2025-04-01 --to 2025-06-30 --symbols DEMOA,DEMOB --demo
```

期間は最大93日です。発表済みの行にはEPSと予想との差が入ります。

## 配当の履歴を見る

```sh
python3 python/zenith_examples.py dividends --symbol DEMOA --demo --csv output/dividends.csv
```

年間合計（`dividendType: annual`）と各回の配当は別の行です。足し合わせないでください。`forecastOrActual`で会社予想と実績を区別できます。

## pandas・Jupyterで使う

[ライブラリとして使う](library.ja.md)を参照してください。

## AIに聞く

[MCP接続ガイド](mcp.md)でAIアプリにつなぎ、「7203と7267の営業利益率を、共通の決算期で比べて」のように質問できます。RESTとMCPは同じ利用枠を使います。

---

結果はご自身の分析用で、投資助言ではありません。株価とTDnetの書類は第三者に表示できません。[表示してよいデータ](https://zenithcode.net/docs/display-rights)を確認してください。
