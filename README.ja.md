# ZENITH Code サンプルコード

[![ZENITH Codeのサービス画面。日本企業の株価・財務・開示データの提供内容と収録規模。](assets/zenith-code-overview.webp)](https://zenithcode.net)

サービス画面は2026年10月26日時点。画像をクリックすると公式サイトが開きます。

**日本株の株価と企業財務を、1つのAPIで。**

[English](README.md) · [公式サイト](https://zenithcode.net) · [ドキュメント](https://zenithcode.net/docs) · [APIキーを取得](https://zenithcode.net/sign-up) · [法人のご相談](https://zenithcode.net/contact-sales)

ZENITH Codeを運営する株式会社Crabgrassの公式Python・JavaScriptサンプルです。

ZENITH Codeは、取引所との正式な契約に基づく日本株の株価に加え、標準化した財務数値と、決算書の階層を残した全科目のデータを提供します。同じ証券コード・APIキーで株価と財務を取得し、ご自身の分析に利用できます。株価は**終値ベースの日次データで、リアルタイムではありません**。

## まず何を試しますか？

| やりたいこと | 入口 | 登録 |
| --- | --- | --- |
| 数値の読み方とグラフを試す | [TDnet③・④の学習サンプル](docs/learning.ja.md) | 不要・追加パッケージ不要 |
| 実際の株価・財務を取得する | **[会員登録してAPIキーを取得 →](https://zenithcode.net/sign-up)** | 必要 |
| エージェントに設定を手伝ってもらう | [コピーして使える依頼文と手順](docs/agent-start.md) | 学習は不要、実データは必要 |

### 動く企業・決算分析テンプレート

![企業・決算分析画面。企業名・株価・財務数値はすべて架空のデモです。](assets/company-analysis-ja.png)

銘柄の選択、売上・利益のグラフ、財務の表、出典確認をひとつの画面で試せます。登録不要のデモから始め、会員登録後は手元の非公開環境で実データへ接続できます。日英切り替え・スマホ表示と、**クール・ポップ・ダーク**のスタイル選択に対応しています。各カード・グラフ・表の「使っているAPI」から、エンドポイント・取得項目・表示への変換方法を確認できます。

**[起動手順とカスタマイズ方法 →](templates/company-analysis/README.ja.md)**

### 登録前に、こんなグラフを作れます

![架空の売上高。累計20・45・72億円を、単独20・25・27億円に変換するグラフ。](assets/quarterly-sales.svg)

**架空データによる学習用の完成例です。** [コードと解説](docs/learning.ja.md)から、期間・単位を読む練習とグラフ作成ができます。実データのAPIサンプルは下の手順で利用します。

### サービス内の解説記事

TDnetを先に学び、その後EDINETへ進みます。

1. [TDnet解析ガイド](https://zenithcode.net/learn/tdnet-xbrl)：決算短信とXBRL、期間・単位の読み方。
2. [EDINET解析ガイド](https://zenithcode.net/learn/edinet-xbrl)：法定開示とタクソノミ・階層構造。
3. [財務データAPIの選び方](https://zenithcode.net/learn/financial-data-api-selection)：解析を自作する範囲とAPI活用の考え方。

## 最初の実行：実データ

1. [会員登録](https://zenithcode.net/sign-up)し、適用されるデータ利用条件を確認・同意したうえで、ダッシュボードからAPIキーを作ります。Freeプランがあります。[最新の料金・利用範囲](https://zenithcode.net/pricing)をご確認ください。
2. このリポジトリを取得します。

```sh
git clone https://github.com/Crab-grass/zenith-code-examples.git
cd zenith-code-examples
```

3. **Python 3.9以上**で実行します。追加パッケージは不要です。APIキーは画面に表示されない入力欄で入力できます。

```sh
python3 python/zenith_examples.py snapshot --symbol 7203
```

トヨタ自動車（7203）の直近取引日の終値と、最大3期分の通期の損益計算書を取得します。API呼び出しは2回です。株価の日付、決算期、会計基準、欠損値、財務の出典をそのまま残します。最新株価と過去の決算を同一時点の情報として扱ったり、期間が異なる値から独自にPER等を計算したりはしません。

**手元の非公開環境で実行してください。** 出力はご自身の利用向けです。実際の株価応答、TDnetの書類・制限対象のリンク、APIキー、それらの画面画像を、公開リポジトリ・Issue・ノートブック・CIログへ掲載しないでください。このリポジトリはコードの配布用で、市場データそのものを配布するものではありません。

## サンプル一覧

PythonとJavaScriptは同じコマンドに対応します。

| コマンド | 取得内容 | 呼び出し回数／APIトークン* |
| --- | --- | --- |
| `snapshot` | 直近終値＋最大3期の通期損益計算書 | 2回／2 |
| `history` | 指定期間の日足四本値・出来高・調整後終値 | 1回／10 |
| `financials` | 出典付きの通期損益計算書、最大3期 | 1回／1 |
| `full` | 直近通期の全科目財務・階層 | 1回／10 |

*2026年10月25日の公開OpenAPI仕様で確認。APIトークンはサービスの利用枠の単位で、LLMのトークンとは別です。最新のプラン・上限が適用されます。結果が0件なら空配列のまま返します。実行時は契約プランの利用枠を消費する場合があります。追加トークンの購入や自動リトライは行いません。

### Python

```sh
python3 python/zenith_examples.py financials --symbol 6758
python3 python/zenith_examples.py history --symbol 7203 --from 2026-09-01 --to 2026-09-30
python3 python/zenith_examples.py full --symbol 7203
```

環境変数`ZENITH_API_KEY`がある場合は、対話入力せずに利用します。

### JavaScript / Node.js

**Node.js 22以上**。npmパッケージのインストールは不要です。Bash・zshでは次の入力方法で、APIキーをコマンド履歴に書かずに設定できます。

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

ローカル・サーバー側で使うコードです。ブラウザに配るJavaScriptへAPIキーを埋め込まないでください。他のシェルでは、その環境の安全な設定方法で`ZENITH_API_KEY`を設定してください。`.env`はGitの追跡対象外ですが、このサンプルは**`.env`を自動で読み込みません**。

## データを読むとき

- `priceDate`は株価の日付、`retrievedAt`は今回取得した日時です。
- 財務の金額は円単位。利益率等の`0.12`は12%です。
- `null`を0に置き換えないでください。会社・期間・会計基準によって収録範囲が異なります。
- この例では通期を明示指定します。四半期用に変更するときは累計・単独四半期の違いを確認してください。
- 株価履歴の`close`と`adjustedClose`は用途に合わせて選びます。
- 履歴のサンプルは出力量を抑えるため365日以内に制限します。API本体の期間上限は仕様書で確認できます。
- 現在の訂正後財務を、当時知り得たデータとしてそのままバックテストに使うことはできません。公表日時・訂正の扱いを確認してください。
- 財務サンプルを改変するときも出典情報を維持し、外部表示時は出典ごとの条件を確認してください。

[データ品質](https://zenithcode.net/data-quality) · [指標の計算方法](https://zenithcode.net/docs/metrics) · [OpenAPI](https://api.zenithcode.net/openapi.json)

## AIから使う

リモートMCPのURLは次のとおりです。

```text
https://mcp.zenithcode.net/mcp
```

[MCP接続ガイド](docs/mcp.md)に、接続方法と質問例をまとめています。RESTとMCPは同じサービス利用枠を消費します。AIアプリ自体の契約・モデル利用料金は別です。

## コードのライセンスとデータの利用条件

このサンプル**コード**はMITライセンスです。APIから取得するデータ、書類、商標、第三者のコンテンツに対する利用許諾ではありません。

現在の公開条件では、株価やTDnetの書類そのもの・制限対象の書類リンクは、どのプランでも第三者への表示・再配布ができません。AIの回答を通じた第三者表示も同様です。組織内でも会員本人の利用や所定の同意などの条件が適用されます。その他のデータを自社サービスで表示する場合はBusiness以上で所定の条件に従い、データそのものの再配布には別途の書面承諾・契約が必要です。

[表示してよいデータ](https://zenithcode.net/docs/display-rights)、[データの出典と利用条件](https://zenithcode.net/legal/data-sources)、[利用規約](https://zenithcode.net/terms)を確認してください。このREADMEは要約です。APIの利用は正式な規約に従います。本サンプルは投資助言ではありません。

## エラー時の確認

| 結果 | 確認すること |
| --- | --- |
| `401` | APIキーを確認。Issueには貼らないでください。 |
| `403` | キーの状態、プラン、データ利用条件への同意を確認。 |
| `429` | レート・利用枠を確認。無制限の再試行を避けてください。 |
| 空配列 | 銘柄・期間の収録範囲を確認。 |
| タイムアウト | 接続環境やサービスの状態を確認。 |

## テスト・改善提案

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

テストは架空の応答を使い、実APIへ接続しません。CIへの秘密情報の登録も不要です。[貢献方法](CONTRIBUTING.md)・[脆弱性の連絡先](SECURITY.md)も参照してください。

## 法人での利用を検討している方へ

用途・対象企業・必要な項目をお知らせください。データの収録範囲、プラン、利用条件をご相談いただけます。

[法人のご相談](https://zenithcode.net/contact-sales) · [contact@zenithcode.net](mailto:contact@zenithcode.net) · [レシピ集](https://zenithcode.net/docs/cookbook)
