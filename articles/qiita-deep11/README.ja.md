# 有価証券報告書の多様性の指標をグループ内で Node.js で並べる

Qiita の「ZENITH Codeディープ解析⑪」のコードです。提出会社（有報を提出する親会社単体）の多様性の数字は、グループの実態を表しているかを、`/stable/diversity` から読みます。電機5社（日立製作所・三菱電機・NEC・富士通・ソニーグループ、決算期 `2026-03`）について、女性管理職比率・男性の育児休業取得率・男女の賃金の差異の親会社の値と、同じ表に載る子会社の値のある社数・最小・中央値・最大・0%の社数・`null`の社数・100%超の社数を出力します。

## 登録不要で動かす（ネットワークも使いません）

Node.js 18 以上が必要です。パッケージのインストールは不要です。[`data/`](data) に保存した応答をそのまま読みます。

```sh
cd articles/qiita-deep11
node diversity-sample.mjs --from-json ./data
node diversity-sample.mjs --from-json ./data --sort-by-gap   # 表示だけの変更: 親会社−子会社中央値の降順
```

出力は [`expected-output.txt`](expected-output.txt)・[`expected-output-sort-by-gap.txt`](expected-output-sort-by-gap.txt) で、記事の出力例と同じ文字列です（テストで突き合わせています）。

## 本番 API で動かす

[ZENITH Code の API キー](https://zenithcode.net/sign-up)（無料プランあり）が必要です。

```sh
export ZENITH_API_KEY=...        # 履歴やリポジトリにキーを残さない
node diversity-sample.mjs --period 2026-03              # 上の5社
node diversity-sample.mjs 7203 7974                     # 自分で選んだ銘柄（最新の有報）
```

1社1回（1トークン）の呼び出しで、無料プランの毎分10回の上限に収まるよう6.5秒あけて呼びます。`--period` を付けないと最新の有報です。429 などの HTTP エラーが返ったときは、再試行せずに止まります。

## 読むときの注意

- 応答は**配列**で、先頭の要素を使います。比率は小数（`0.089` = 8.9%）で、`toFixed(1)` で表示します。
- `reportingCompany` は提出会社単体の値です。`subsidiaries` は有報の多様性の表に載る子会社で、**連結子会社の総数ではありません**。
- `0` と `null` は意味が違います。原文の `0.0` は `0`、`－`（算定対象者がいない等）は `null` です。`null` は別に数えて 0% にせず、「値のある社数/掲載社数」（`子(62/64, null 2)`）を添えます。値が1社も無い指標（任天堂の子会社の女性管理職比率）は落ちずに `—` と出します。
- 男性育休の100%超は算定式による正常値（前年度以前に生まれた子の育休を当年度に取得）で、賃金の差異の100%超は女性の平均賃金の方が高い区分です。どちらも上限で丸めたり除外したりしません。
- 親会社の男性育休の算定基準は `maleChildcareLeaveBasis`（`childcare-leave` か `childcare-leave-and-purpose-leave`）で返ります。子会社は `null` なので、子会社どうしを比べるときは有報の注記で基準を確かめてください。
- `HTTP 404`・200 の空配列・項目の `null` は別のものとして扱います。取得した時点で 404 だった例は `8951` と `9399` です。
- `docId` と `sourceUrl` は EDINET の原文を指します。数字は原文で確かめてください。

## テスト

リポジトリのルートで `node --test tests/*.test.mjs` を実行すると、[`tests/qiita-deep11.test.mjs`](../../tests/qiita-deep11.test.mjs) が動きます。null と 0 の区別・奇数と偶数の中央値・100%超・値の無い指標・404 と空の 200・レート制限での停止・`--sort-by-gap` を架空の値で確かめ、保存した応答の出力が上の2つのファイルと一致することも確かめます。

`data/` の応答は、2026年11月27日 19:07（日本時間）に `/stable/diversity` から取得したものです（決算期 `2026-03`・2026年6月提出の有報）。株価や API キーは含みません。コードは MIT ライセンスで、API のデータの権利を与えるものではありません。本番の応答は、[利用規約](https://zenithcode.net/terms)の範囲で自分の用途に使ってください。

Data provided by ZENITH Code（出典: EDINET・各社の開示。ZENITH Code が加工）。データの正確性・完全性・適時性は保証されません。投資助言ではありません。

English: [README.md](README.md)
