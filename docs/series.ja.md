# Qiita連載とコードの対応表

[English](series.md) · [README](../README.ja.md)

株式会社CrabgrassがQiitaで公開している連載と、このリポジトリで動かせるコードの対応です。記事は考え方と手順の説明、このリポジトリは**手元で動くコードと確認用のテスト**を受け持ちます。記事を全部読んでいなくても、各行の「このリポジトリで」から始められます。

[Qiitaの記事一覧（Sohei-Taniguchi-CG）](https://qiita.com/Sohei-Taniguchi-CG)

## おすすめの順番

| 目的 | 始める場所 | 会員登録 |
| --- | --- | --- |
| 決算書類とXBRLの基本を知る | TDnet解析① → ④ → EDINET解析① → ④ | 不要 |
| まず手を動かしてグラフを作る | [TDnet③・④の学習サンプル](learning.ja.md) | 不要 |
| 実データで1社の推移・利益率を見る | [実践①・②のコード](../practice/README.ja.md) | 必要 |
| 複数社を条件をそろえて比べる | `compare`コマンド（[README](../README.ja.md#サンプル一覧)） | 必要 |
| 自分用の分析画面を作る | [企業・決算分析テンプレート](../templates/company-analysis/README.ja.md) | サンプルは不要 |
| 自社と競合を比べる | [比較ボード](../templates/peer-benchmark/README.ja.md) | 保存データは不要 |
| 1 社を深く調べる | [深掘りワークスペース](../templates/company-deep-dive/README.ja.md) | 保存データは不要 |

## TDnet解析（全4回）

決算短信と適時開示、Inline XBRLの読み方です。

| 回 | 記事 | このリポジトリで |
| --- | --- | --- |
| ① | [TDnetとは？決算短信・適時開示とEDINETの違い](https://qiita.com/Sohei-Taniguchi-CG/items/9b1b92036b5453b7cc72) | 読み物。コードはありません |
| ② | [XBRLとは？決算短信のPDFと数値データを図解](https://qiita.com/Sohei-Taniguchi-CG/items/7e31c7c1720b5f7872f8) | [Inline XBRLの小さな教材](../learning/tdnet-sales.xhtml)で、記事の要素を実物で確認 |
| ③ | [XBRLの値を比較する前に、期間・単位・欠損を確かめる](https://qiita.com/Sohei-Taniguchi-CG/items/2aa5bed0da189682529c) | `python3 python/learn_tdnet.py`（[解説](learning.ja.md)） |
| ④ | [累計と四半期単独、実績と予想を分けてグラフにする](https://qiita.com/Sohei-Taniguchi-CG/items/6d8e3a83dc82e115ff57) | `python3 python/quarterly_chart.py`（[解説](learning.ja.md)） |

## EDINET解析（全4回）

有価証券報告書、タクソノミ、財務諸表の階層の読み方です。

| 回 | 記事 | このリポジトリで |
| --- | --- | --- |
| ① | [EDINETとは？有価証券報告書から企業を理解する](https://qiita.com/Sohei-Taniguchi-CG/items/b3c1c0f7ddb85764aa13) | 読み物。コードはありません |
| ② | [XBRLとは？有価証券報告書の構造とタグの仕組みを理解する](https://qiita.com/Sohei-Taniguchi-CG/items/66963590299e01f32990) | `full`コマンドで、決算書の階層を残した全科目を取得 |
| ③ | [TDnetの次に読むXBRL――ファイル・タグ・コンテキストの違いを確かめる](https://qiita.com/Sohei-Taniguchi-CG/items/7227bc4f051fa88ea5d1) | TDnet③の教材と見比べ、どこが同じでどこが違うかを確認 |
| ④ | [財務データを継続的な分析に使う](https://qiita.com/Sohei-Taniguchi-CG/items/7f43d854ac8f3c15165d) | `trend --csv`で、取得日時・書類IDを行ごとに残したCSVを作る |

## ZENITH Code実践（全8回）

企業や決算期を選び、業績の推移・営業利益率・他社比較・出典を一つの画面で確認できる、自分用の企業分析ページを作る連載です。Qiitaで全8回を公開しています。

| 回 | 扱う内容 | このリポジトリで |
| --- | --- | --- |
| ① | [売上高・営業利益を取得し、グラフにする](https://qiita.com/Sohei-Taniguchi-CG/items/b9b8b1580ba30b6b06c3) | [practice01_fetch.py・practice01_plot.py](../practice/README.ja.md) |
| ② | [営業利益率を計算し、APIの値と照合する](https://qiita.com/Sohei-Taniguchi-CG/items/0b2d22511a6cddf5ae7d) | [practice02_margin.py](../practice/README.ja.md) |
| ③ | [2社の比較条件を揃える](https://qiita.com/Sohei-Taniguchi-CG/items/c74edd2c330a69bc9dac) | `compare --symbols 7203,7267`で、共通の決算期と、会計基準・期間の長さの違いを確認 |
| ④ | [企業と指標を切り替えられる分析画面を作る](https://qiita.com/Sohei-Taniguchi-CG/items/f7f1fd4582ece2e4409a) | [企業・決算分析テンプレート](../templates/company-analysis/README.ja.md)を架空データで起動 |
| ⑤ | [財務表と出典をたどれる画面を作る](https://qiita.com/Sohei-Taniguchi-CG/items/9ec079444e5a818ccb7d) | 同テンプレートの財務表・CSV出力・「出典情報を確認」 |
| ⑥ | [決算期と前期比を分析画面に加える](https://qiita.com/Sohei-Taniguchi-CG/items/e3942e2e1d71ef30054a) | 同テンプレートの決算期の選択と前期比 |
| ⑦ | [PCとスマホで使いやすい分析画面に整える](https://qiita.com/Sohei-Taniguchi-CG/items/96b1de81d30de4d9dfa0) | 同テンプレートのテーマ・画面幅に応じた並び・表示設定の保存 |
| ⑧ | [ZENITH Codeの実データで分析画面を動かす](https://qiita.com/Sohei-Taniguchi-CG/items/6f927c65172a28401525) | 同テンプレートの実データ接続（APIキーは手元のサーバーだけで扱う） |

①・②の記事に載せたコードと、`practice`フォルダのコードは同じ内容です。記事を公開した後に記事側を直した場合は、こちらも合わせて更新します。

## ZENITH Code分析（全5回）

競合調査や経営会議の資料で使う分析を、2つのダッシュボードのテンプレートで行う連載です。Qiitaで順に公開します。

| 回 | 扱う内容 | このリポジトリで |
| --- | --- | --- |
| ① | [同業他社ベンチマークを自動で作る――収益性と効率を業種の分布の中で見る](https://qiita.com/Sohei-Taniguchi-CG/items/de733ed981cd5d21e738) | [比較ボード](../templates/peer-benchmark/README.ja.md)のROE・ROA・3年成長率と業種の四分位 |
| ② | 競合がどの事業で稼いでいるかを比べる | 深掘りワークスペースと比較ボードの事業構成 |
| ③ | 財務体質とキャッシュフローを競合と比べる | [深掘りワークスペース](../templates/company-deep-dive/README.ja.md) |
| ④ | 業績予想の修正の履歴を追う | 深掘りワークスペースの会社計画と実績 |
| ⑤ | 人と組織の開示を競合と比べる | 比較ボードの人材 |

## 記事より先に進みたいとき

- **まとめて見る**：`python3 python/report.py --symbol <証券コード> --out output/report --lang ja`で、グラフ付きの1社分のレポートを作れます。目的別の手順は[レシピ集](recipes.ja.md)にあります。
- **他の企業で同じ分析をする**：`trend --symbol <証券コード>`。記事のコードを書き換えずに、利益率の計算・APIとの照合・CSV出力まで行えます。
- **AIに手伝ってもらう**：[MCP接続ガイド](mcp.md)、[エージェントと利用を始める](agent-start.md)。
- **使う項目を選ぶ**：[財務データAPIの選び方](https://zenithcode.net/learn/financial-data-api-selection)、[APIドキュメント](https://zenithcode.net/docs)。

取得したデータの扱いは、[README](../README.ja.md#コードのライセンスとデータの利用条件)の利用条件に従ってください。記事やこのリポジトリのコードは、分析方法の例であって投資助言ではありません。
