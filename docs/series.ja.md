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

企業や決算期を選び、業績の推移・営業利益率・他社比較・出典を一つの画面で確認できる、自分用の企業分析ページを作る連載です。Qiitaで順に公開します。

| 回 | 扱う内容 | このリポジトリで |
| --- | --- | --- |
| ① | 売上高・営業利益を取得し、グラフにする | [practice01_fetch.py・practice01_plot.py](../practice/README.ja.md) |
| ② | 営業利益率を計算し、APIの値と照合する | [practice02_margin.py](../practice/README.ja.md) |
| ③ | 2社の比較条件を揃える | `compare --symbols 7203,7267`で、共通の決算期と、会計基準・期間の長さの違いを確認 |
| ④ | サンプルデータでブラウザ画面を動かす | [企業・決算分析テンプレート](../templates/company-analysis/README.ja.md)を架空データで起動 |
| ⑤ | 財務表と出典を結び付ける | 同テンプレートの財務表と「出典情報を確認」 |
| ⑥ | 決算期と前期比を扱う | 同テンプレート（期間の選択と前期比は、記事の公開に合わせて追加します） |
| ⑦ | 余白・配色・表示内容を整える | 同テンプレートの3つの表示スタイル |
| ⑧ | サンプルから実データへ切り替える | 同テンプレートの実データ接続（APIキーは手元のサーバーだけで扱う） |

①・②の記事に載せたコードと、`practice`フォルダのコードは同じ内容です。記事を公開した後に記事側を直した場合は、こちらも合わせて更新します。

## 記事より先に進みたいとき

- **他の企業で同じ分析をする**：`trend --symbol <証券コード>`。記事のコードを書き換えずに、利益率の計算・APIとの照合・CSV出力まで行えます。
- **AIに手伝ってもらう**：[MCP接続ガイド](mcp.md)、[エージェントと利用を始める](agent-start.md)。
- **使う項目を選ぶ**：[財務データAPIの選び方](https://zenithcode.net/learn/financial-data-api-selection)、[APIドキュメント](https://zenithcode.net/docs)。

取得したデータの扱いは、[README](../README.ja.md#コードのライセンスとデータの利用条件)の利用条件に従ってください。記事やこのリポジトリのコードは、分析方法の例であって投資助言ではありません。
