# TDnet③・④の学習サンプル

[README](../README.ja.md) · [English](learning.md)

まず[TDnet解析ガイド](https://zenithcode.net/learn/tdnet-xbrl)で開示書類とXBRLの関係を確認し、③→④の順に進めます。EDINETの話はその後です。

**会員登録・APIキー・追加パッケージは不要です。** Python 3.9以上で、リポジトリのルートから実行してください。通信は行いません。ファイルは学習用に作成した架空の値で、企業の開示書類や実際のAPI応答ではありません。

## TDnet③：売上高の「数字以外」を読む

```sh
python3 python/learn_tdnet.py
```

[小さなInline XBRL教材](../learning/tdnet-sales.xhtml)から売上高を1件読み取ります。[コード](../python/learn_tdnet.py)と教材を横に並べて、次の順で追ってみてください。

```xml
<ix:nonFraction name="tse-ed-t:NetSales"
  contextRef="demo-q2" unitRef="JPY"
  decimals="-6" scale="6" format="ixt:numdotdecimal">4,500</ix:nonFraction>
```

`ix:nonFraction`は数値を表す要素、`name`は「何の数値か」を示します。この例ではTDnetの売上高を表す`NetSales`です。表示上の`4,500`だけでは、単位も期間も分かりません。

| 確認したいこと | どこをたどるか | この教材の結果 |
| --- | --- | --- |
| 何の数値か | `name`の接頭辞を名前空間URIへ解決する | TDnetの`NetSales`（売上高） |
| いつの数値か | `contextRef="demo-q2"` → 同じ`id`の`xbrli:context` → `period` | 2025-04-01〜2025-09-30の累計 |
| どの会社か | 同じcontext → `entity/identifier` | 架空の`SYNTHETIC` |
| 連結か、実績か | 同じcontext → `scenario/explicitMember` | `ConsolidatedMember`、`ResultMember` |
| 何の単位か | `unitRef="JPY"` → 同じ`id`の`xbrli:unit` → `measure` | `iso4217:JPY`（円） |
| 表示値の倍率 | fact自身の`scale` | 10の6乗を掛ける |
| 数値の精度 | fact自身の`decimals` | `-6`。倍率ではなく精度の情報 |

この例は **4,500 × 10⁶ = 4,500,000,000円 = 45億円** です。`decimals="-6"`をもう一度掛けたり、`unitRef`の名前だけで単位を推測したりしません。

contextの`id`は参照用のラベルです。`demo-q2`という文字から期間を推測せず、実際の`startDate`・`endDate`を読んでいます。同じ売上高でも、前年・予想・非連結など別contextの数値が並ぶことがあるためです。

### コードが止まる理由も確認する

コードは指定contextの売上高が1件であることを確認します。0件や重複なら、先頭の数値を勝手に選ばずエラーにします。`xsi:nil="true"`は`null`として残します。未対応の数値書式・単位・継続要素などもエラーです。

接頭辞の文字列は文書ごとに違う可能性があるので、`tse-ed-t`の綴りではなく名前空間URIと`NetSales`の組で判定しています。ただし、この教材では接頭辞が途中で別URIへ再定義される文書は対象外です。

**これは1つの数値を読む教材で、汎用パーサーではありません。** schemaRefの読込、タクソノミの検証、表示・計算リンクベース、訂正書類の対応付け、全会計基準の科目対応は実装していません。現行の一次資料は[JPXのXBRLデータの仕様](https://www.jpx.co.jp/equities/listing/disclosure/xbrl/03.html)で確認できます。教材はTDnetの概念名を使っていますが、正式な提出用インスタンスではありません。

## TDnet④：累計から四半期単独へ

```sh
python3 python/quarterly_chart.py
```

[架空の累計売上高](../learning/quarterly-sales.json)を読み、`output/quarterly-sales.svg`を作ります。SVGファイルをブラウザ等で開くと、次の図が表示されます。画像生成にも追加パッケージは不要です。

![架空の売上高。累計20・45・72億円から単独20・25・27億円へ。Q4は未取得。](../assets/quarterly-sales.svg)

| 期間 | 開示された累計 | 単独四半期の計算 | 結果 |
| --- | ---: | --- | ---: |
| Q1：4〜6月 | 20億円 | 最初の3か月なので、そのまま | 20億円 |
| Q2：7〜9月 | 45億円 | 4〜9月累計 − 4〜6月累計 | 25億円 |
| Q3：10〜12月 | 72億円 | 4〜12月累計 − 4〜9月累計 | 27億円 |
| Q4：1〜3月 | 未取得 | 通期実績がないので計算しない | 欠損 |

グラフの左右は同じ縦軸です。累計と単独の違いを、軸の縮尺の違いと取り違えないようにしています。

### 引き算の前に、条件を揃える

[コード](../python/quarterly_chart.py)は会社・項目・会計基準・期首・期末・連結区分・実績区分・単位を確認します。入力が不足した場合も計算を止めます。ここでは4月始まりの同じ年度、同じ基準で比較できる売上高3件に限定しています。

- **通期予想は通期実績ではありません。** 予想が110億円でも、110−72＝38億円を「Q4実績」として埋められません。
- **欠損は0ではありません。** 前の累計がなければ差分を計算できません。
- **訂正は元データの組を揃えます。** Q1が20→21億円へ訂正され、Q2累計45億円と比較可能だと確認できた場合、Q2単独は24億円です。単に最新のファイル同士を引けばよいとは限りません。
- **出典を2つ残します。** Q2単独の結果には`synthetic-q2`と`synthetic-q1`を残します。このIDは教材内のラベルで、TDnetの開示番号ではありません。
- **別の指標へそのまま使わないでください。** EPS、比率、貸借対照表の残高に同じ引き算を適用するコードではありません。決算期変更や会計基準変更の調整も行いません。

## この先に進む

1. [TDnet解析ガイド](https://zenithcode.net/learn/tdnet-xbrl)：書類・期間・単位を振り返る。
2. [EDINET解析ガイド](https://zenithcode.net/learn/edinet-xbrl)：TDnetの学習後に、法定開示や階層構造の違いを学ぶ。
3. [財務データAPIの選び方](https://zenithcode.net/learn/financial-data-api-selection)：自分で解析する範囲とAPIを利用する範囲を考える。

実際の企業データを扱う場合は、[会員登録](https://zenithcode.net/sign-up)後に[APIサンプル](../README.ja.md#最初の実行実データ)へ進みます。[エージェントと始める手順](agent-start.md)も用意しています。
