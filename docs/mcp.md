# Use ZENITH Code with an AI assistant / AIから使う

Remote MCP endpoint / リモートMCPのURL:

```text
https://mcp.zenithcode.net/mcp
```

## English

1. Create a ZENITH Code account, accept the applicable terms, and create an API key in your dashboard.
2. In an AI client that supports remote MCP with OAuth, add the URL above as a connector and complete the ZENITH Code sign-in/authorization flow. Do not paste an API key into the chat.
3. For clients using API-key authentication, configure the `x-api-key` header with your key using the client's private secret/configuration mechanism. Do not commit the key or a populated configuration file.
4. Follow the [current client-specific setup guide](https://zenithcode.net/en/guides/mcp). Client support and account requirements vary.

Try these prompts in your own private session:

- “Get Toyota Motor's latest closing price. Include the price date and explain whether it is real-time.”
- “Get Toyota Motor's last three annual income statements. Preserve missing values, fiscal periods and accounting standards, and include the source references.”
- “Compare Toyota and Honda's latest annual operating margins. Identify differences in fiscal periods before comparing. Do not turn missing data into zero.”

The AI must retrieve data rather than invent it. Check tool results, units, periods and citations before relying on an answer. Your account's plan/quota and data-use conditions apply to MCP as well as REST. In particular, stock prices and TDnet documents/links must not be disclosed to third parties through AI responses under the currently published terms. The examples here are for the registered user's own use.

## 日本語

1. ZENITH Codeに登録し、適用される規約に同意したうえで、ダッシュボードからAPIキーを作成します。
2. リモートMCPとOAuthに対応するAIクライアントで、上記URLをコネクタとして登録し、ZENITH Codeのログイン・認可を進めます。チャット本文にAPIキーを貼らないでください。
3. APIキー認証を使うクライアントでは、非公開の設定・秘密情報の管理機能で`x-api-key`ヘッダーにキーを設定します。キーや入力済み設定ファイルをGitへ登録しないでください。
4. 操作や対応プランはクライアントごとに異なります。[最新の接続ガイド](https://zenithcode.net/guides/mcp)を参照してください。

ご自身の非公開セッションで試す質問例:

- 「トヨタ自動車の直近終値を取得し、株価の日付と、リアルタイム値かどうかを示して」
- 「トヨタの直近3期の通期損益計算書を取得して。欠損・決算期・会計基準を残し、出典を付けて」
- 「トヨタとホンダの直近通期の営業利益率を比較して。先に決算期の違いを確認し、欠損を0に置き換えないで」

AIには実データを取得させ、数値を推測させないでください。ツールの応答・単位・期間・出典を確認します。MCPにもRESTと同じ契約プラン・利用枠・利用条件が適用されます。特に株価やTDnet書類・制限対象リンクをAIの回答を通じて第三者に見せることは、現在の公開条件ではできません。上記は会員本人が使う例です。
