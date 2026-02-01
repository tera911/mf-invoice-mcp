# MF Invoice MCP

MoneyForward クラウド請求書 API v3 を使用した MCP プラグイン。インボイス制度対応の見積書・請求書の作成を自動化します。

## 機能

### 認証
- `mf_auth_status` - 認証状態の確認
- `mf_auth_start` - OAuth認証の開始
- `mf_auth_callback` - 認証コードでトークン取得
- `mf_refresh_token` - トークンのリフレッシュ

### 取引先
- `mf_list_partners` - 取引先一覧の取得
- `mf_get_partner` - 取引先詳細の取得

### 品目
- `mf_list_items` - 品目一覧の取得
- `mf_get_item` - 品目詳細の取得

### 見積書
- `mf_list_quotes` - 見積書一覧の取得
- `mf_get_quote` - 見積書詳細の取得
- `mf_create_quote` - 見積書の作成（インボイス対応）
- `mf_update_quote` - 見積書の更新
- `mf_download_quote_pdf` - 見積書PDFのURL取得
- `mf_convert_quote_to_billing` - 見積書を請求書に変換

### 納品書
> ⚠️ **注意**: v3 APIでは納品書作成エンドポイントが提供されていません。納品書が必要な場合はマネーフォワードのWebUIで作成してください。

### 請求書
- `mf_list_billings` - 請求書一覧の取得
- `mf_get_billing` - 請求書詳細の取得
- `mf_create_billing` - 請求書の作成（インボイス対応）
- `mf_create_billing_from_quote` - 見積書から請求書を作成
- `mf_update_billing` - 請求書の更新
- `mf_update_payment_status` - 入金状態の更新
- `mf_download_billing_pdf` - 請求書PDFのURL取得

## インボイス制度対応

本MCPはインボイス制度（適格請求書等保存方式）に対応しています。

### 消費税区分（excise）
請求書・見積書作成時に明細行ごとに消費税区分を指定します。

| 値 | 説明 |
|----|------|
| `ten_percent` | 10% |
| `eight_percent_as_reduced_tax_rate` | 軽減税率8% |
| `eight_percent` | 8% |
| `untaxable` | 対象外 |
| `non_taxable` | 非課税 |

### department_id
インボイス対応請求書の作成には取引先の`department_id`が必要です。本MCPでは`mf_create_billing`・`mf_create_quote`実行時に自動で取引先の部門情報を取得します。

## セットアップ

### 1. MoneyForward クラウドでAPIアプリケーションを作成

1. [MoneyForward クラウド](https://biz.moneyforward.com/)にログイン
2. 開発者設定からAPIアプリケーションを作成
3. Client ID と Client Secret を取得
4. リダイレクトURIを設定（例: `http://localhost:38080/callback`）
5. **クライアント認証方式を `client_secret_post` に設定**（重要）

> ⚠️ **注意**: クライアント認証方式はデフォルトで `client_secret_basic` になっていますが、本MCPでは `client_secret_post` 方式を使用しています。アプリケーション作成時に必ず変更してください。

### 2. 環境変数の設定

```bash
export MF_CLIENT_ID="your_client_id"
export MF_CLIENT_SECRET="your_client_secret"
export MF_CALLBACK_PORT="8080"  # オプション（デフォルト: 8080）
```

**重要**: MoneyForwardのAPIアプリケーション設定で、リダイレクトURIに `http://localhost:8080/callback` を登録してください。

### 3. ビルド

```bash
npm install
npm run build
```

### 4. Claude Desktop への設定

`~/Library/Application Support/Claude/claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "mf-invoice": {
      "command": "node",
      "args": ["/path/to/mf-invoice-mcp/dist/index.js"],
      "env": {
        "MF_CLIENT_ID": "your_client_id",
        "MF_CLIENT_SECRET": "your_client_secret",
        "MF_CALLBACK_PORT": "8080"
      }
    }
  }
}
```

### 5. 初回認証

1. Claude で `mf_auth_start` を実行
2. 表示されたURLをブラウザで開く
3. MoneyForward にログインして認可
4. 認証完了後、自動的にトークンが保存される

**注意**: 認証時はポート8080（またはMF_CALLBACK_PORTで指定したポート）が空いている必要があります。

## 使用例

### 見積書を作成して請求書に変換

```
User: A社への見積書を作成して

Claude: まず取引先を検索します。
[mf_list_partners で検索]

User: 見つかった。作成して。

Claude: [mf_create_quote で作成]
見積書を作成しました。

User: これで承認されたから請求書を作って

Claude: [mf_convert_quote_to_billing で変換]
見積書から請求書を作成しました。
```

### 見積書・納品書・請求書の3点セット

```
User: B社への見積書を作成して、承認されたら納品書と請求書も作って

Claude: [mf_create_quote で作成]
見積書を作成しました。

User: 承認された

Claude: [mf_convert_quote_to_billing で請求書作成]
請求書を作成しました。

⚠️ 納品書はv3 APIでは作成できません。
マネーフォワードのWebUIから作成してください。
```

### 過去の請求書を参照して新規作成（インボイス対応）

```
User: 先月B社に送った請求書と同じ内容で今月分を作成して

Claude: [mf_list_billings でB社の請求書を検索]
前月の請求書が見つかりました。同じ内容で作成しますか？
※インボイス対応のため消費税10%を適用します

User: はい

Claude: [mf_create_billing で作成（excise: ten_percent指定）]
請求書を作成しました。
```

## API制限

- レート制限: 1秒あたり3リクエストまで（自動で制御）
- 超過時は HTTP 429 が返され、自動でリトライ

## v3 API 制限事項

- **納品書作成**: v3 APIでは`/delivery_slips/from_quote`エンドポイントが提供されていません。納品書が必要な場合はWebUIで作成してください。
- **請求書作成**: インボイス対応の請求書作成には`/invoice_template_billings`エンドポイントを使用します（旧`/billings`へのPOSTは404エラー）。

## トークン保存場所

認証情報は `~/.config/mf-invoice-mcp/tokens.json` に保存されます。

## ライセンス

MIT
