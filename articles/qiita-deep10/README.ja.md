# 有価証券報告書の「提出会社」と「連結」の従業員数を Node.js で並べる

Qiita の「ZENITH Codeディープ解析⑩」のコードです。企業グループの従業員のうち、何人が提出会社（親会社）にいて、何人がグループの外側にいるのかを、`/stable/workforce` から読みます。電機5社（日立製作所・三菱電機・富士通・NEC・ソニーグループ、決算期 `2026-03`）の従業員数、連結と提出会社の事業別の人員、提出会社の平均年齢・勤続年数・平均年間給与を出力します。

## 登録不要で動かす（ネットワークも使いません）

Node.js 18 以上が必要です。パッケージのインストールは不要です。[`data/`](data) に保存した応答をそのまま読みます。

```sh
cd articles/qiita-deep10
node workforce-sample.mjs --from-json ./data
node workforce-sample.mjs --from-json ./data --segments        # 事業ごとに、連結・提出会社の人数と提出会社の割合
node workforce-sample.mjs --from-json ./data --sort-by-share   # 表示だけの変更: 提出会社の割合の降順・5%未満の前に区切り線
```

出力は [`expected-output.txt`](expected-output.txt)・[`expected-output-segments.txt`](expected-output-segments.txt)・[`expected-output-sort-by-share.txt`](expected-output-sort-by-share.txt) で、記事の出力例と同じ文字列です（テストで突き合わせています）。

## 本番 API で動かす

[ZENITH Code の API キー](https://zenithcode.net/sign-up)（無料プランあり）が必要です。

```sh
export ZENITH_API_KEY=...        # 履歴やリポジトリにキーを残さない
node workforce-sample.mjs --period 2026-03                    # 上の5社
node workforce-sample.mjs --period 2026-03 7203 7267 8951     # 自分で選んだ銘柄
```

1社1回（1トークン）の呼び出しで、無料プランの毎分10回の上限に収まるよう6.5秒あけて呼びます。`--period` を付けないと最新の有報です。429 などの HTTP エラーが返ったときは、再試行せずに止まります。

## 読むときの注意

- 応答は**配列**で、先頭の要素を使います。
- `employees`・`averageAge`・`averageTenureYears`・`averageAnnualSalary` は**提出会社単体**の値で、グループ全体ではありません。連結は `consolidatedEmployees` です。給与の集計範囲は各社の有報の注記に従います（例: NEC の有報 `S100YBFV` の注3 は、当事業年度から、当社から他社への出向者と他社から当社への出向者をいずれも除いて平均年間給与を算出すると書いています）。
- 事業別の人員は `isSubtotal: true` の小計行を除いて足します。空配列・小計行のみ・数値の無い行・**部分和**は、その旨を表示し（差と最大区分は `—`）、和が総数を超える場合は一致したように出さず「原文を確認」にします。
- `parentSegments` は提出会社の事業別の人員です。事業の名前で `segments` と照らし合わせ、提出会社の側に行が無い事業は 0 ではなく `—` と出します（三菱電機の提出会社の表には「その他」の行が無く、ソニーグループの提出会社の表は「全社（共通）」だけです）。`parentSegments` が空配列のときは、「開示なし」とは書かず、「APIの応答に提出会社の区分の行なし」と表示します。原本の表で確かめてください。
- 「※提出会社は連結の5%未満」の5%は、記事の中の表示の基準で、API や法令の基準ではありません。平均年間給与は、提出会社の従業員数と連結に占める割合を隣に置いて読みます。
- 丸め単位は会社ごとに違います。ソニーグループの有報（`S100YE2C`・「従業員の状況」の注1）は、従業員数を百人未満を四捨五入して書いており（連結 94,900人）、差の 92,734人と提出会社の外の割合 97.7% はその丸めた開示値から計算した値です。
- `HTTP 404`・200 の空配列・項目の `null` は別のものとして扱い、0 にはしません。取得した時点で 404 だった例は `8951` と `9399` です。
- `docId` と `sourceUrl` は EDINET の原文を指します。数字は原文で確かめてください。

## テスト

リポジトリのルートで `node --test tests/*.test.mjs` を実行すると、[`tests/qiita-deep10.test.mjs`](../../tests/qiita-deep10.test.mjs) が動きます。小計行・部分和・総数超過・事業ごとの突き合わせ・null・404 と空の 200・レート制限での停止・`--segments`・`--sort-by-share` を架空の値で確かめ、保存した応答の出力が上の2つのファイルと一致することも確かめます。

`data/` の応答は、2026年11月24日 13:45（日本時間）に `/stable/workforce` から取得したものです（決算期 `2026-03`・2026年6月提出の有報）。株価や API キーは含みません。コードは MIT ライセンスで、API のデータの権利を与えるものではありません。本番の応答は、[利用規約](https://zenithcode.net/terms)の範囲で自分の用途に使ってください。

Data provided by ZENITH Code（出典: EDINET・各社の開示。ZENITH Code が加工）。データの正確性・完全性・適時性は保証されません。投資助言ではありません。

English: [README.md](README.md)
