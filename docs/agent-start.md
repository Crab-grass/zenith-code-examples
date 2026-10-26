# Start with an agent / エージェントと利用を始める

[English README](../README.md) · [日本語 README](../README.ja.md) · [MCP](mcp.md)

## エージェントへの依頼文

このリポジトリを読める開発エージェントへ、次のように依頼できます。

> このリポジトリの docs/agent-start.md と README.ja.md を読んで、ZENITH Codeの利用開始を手伝ってください。まず登録不要のサンプルを実行してください。その後、実データを使うための本人認証・規約同意・APIキー設定を案内してください。秘密情報はチャットやGitに残さず、最初のAPI呼び出しの用途と利用枠を説明してから実行してください。

これはエージェントが読むための手順です。GitHubの画面にエージェントが内蔵されたり、GitHubへログインするだけでZENITH Codeへ登録されたりする機能ではありません。ブラウザを操作できないエージェントは、登録先のリンクを案内します。

### 現在使える流れ

1. READMEの手順でリポジトリを取得し、Python 3.9以上を確認します。`python3 python/learn_tdnet.py`と`python3 python/quarterly_chart.py`は登録不要です。
2. 実データを利用する方には[ZENITH Codeの登録画面](https://zenithcode.net/sign-up)を案内します。既存会員は[ログイン](https://zenithcode.net/sign-in)を利用します。
3. 本人認証・規約の確認と同意はユーザーが確認できる形で進めます。パスワード・ワンタイムコードをチャット本文へ求めません。OAuthの連携許可と、ZENITH Codeの規約・データ利用条件への同意は別の確認です。
4. 適用されるデータ利用条件を確認・同意した後、[APIキー画面](https://zenithcode.net/api-keys)でキーを作成します。現在、MCPでOAuthログインしても、有効なAPIキーがない場合はこの作成手順が必要です。
5. RESTサンプルを使う場合、ユーザーが自分のローカル端末でキーを非表示入力するか、非公開の秘密情報管理機能を使います。エージェントはキーを表示・記録・Git追加しません。Pythonは直接非表示入力でき、JavaScriptの設定手順はREADMEにあります。
6. 最初の取得内容と利用枠を確認してから、`snapshot --symbol 7203`を実行します。出力は非公開で確認します。料金プラン変更・トークン購入・外部公開をセットアップに含めません。

AIチャットから使う場合は、[MCP接続ガイド](mcp.md)を利用してください。対応クライアントでサーバーURLを登録するとOAuth認証へ進めます。クライアントの対応状況やログイン状態によって、認証画面での操作が必要です。**このリポジトリに、チャット内だけで新規登録・規約同意・キー発行を完了する機能はありません。**

## Prompt for your agent

> Read docs/agent-start.md and README.md, then help me get started with ZENITH Code. Run the offline examples first. Next, guide me through identity verification, terms acceptance and API-key setup for real data. Keep secrets out of chat and Git. Explain the first request and its quota cost before making it.

Follow the same sequence: run the offline lessons, open [sign-up](https://zenithcode.net/en/sign-up) or [sign-in](https://zenithcode.net/en/sign-in), let the user complete identity verification and review/accept applicable terms, then create an API key in the dashboard. Current OAuth MCP use also requires an active API key; it does not automatically provision one.

For REST, have the user enter the key privately in their own terminal or a secret manager. For an AI client, use the [MCP guide](mcp.md). Agent capabilities vary; an agent without browser access can provide links. This guide does not implement headless account creation, automatic terms acceptance, or automatic key issuance. Signing into GitHub does not sign you into ZENITH Code.
