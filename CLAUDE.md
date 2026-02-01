# MF Invoice MCP 開発ガイド

このファイルはClaude Code向けのプロジェクト固有の指示です。

## プロジェクト概要

MoneyForward クラウド請求書 API v3 を使用したMCPプラグイン。
インボイス制度対応の見積書・請求書の作成自動化を目的としています。

> ⚠️ **注意**: v3 APIでは納品書作成エンドポイントが提供されていません。納品書が必要な場合はマネーフォワードのWebUIで作成してください。

## アーキテクチャ

```
src/
├── index.ts          # MCPサーバーエントリポイント（ツール登録）
├── auth/oauth.ts     # OAuth 2.0認証（トークン永続化）
├── api/              # APIクライアント層
│   ├── client.ts     # 共通クライアント（レート制限: 3req/sec）
│   ├── partners.ts   # 取引先API（部門取得含む）
│   ├── items.ts      # 品目API
│   ├── quotes.ts     # 見積書API（請求書変換含む）
│   ├── billings.ts   # 請求書API（インボイス対応）
│   └── delivery.ts   # 納品書API（v3 API未サポート）
├── tools/            # MCPツール層（ユーザー向けインターフェース）
│   ├── auth.ts
│   ├── partners.ts
│   ├── items.ts
│   ├── quotes.ts     # 見積書ツール + mf_convert_quote_to_billing
│   ├── billings.ts   # mf_create_billing（/invoice_template_billings使用）
│   └── delivery.ts   # v3 API未サポートのため機能しない
└── types/index.ts    # 型定義
```

## MoneyForward Invoice API v3 仕様

### 認証
- OAuth 2.0 Authorization Code Flow
- 認可URL: `https://api.biz.moneyforward.com/authorize`
- トークンURL: `https://api.biz.moneyforward.com/token`
- スコープ: `mfc/invoice/data.read mfc/invoice/data.write`
- リダイレクトURI: `http://localhost:38080/callback`（ローカルサーバー方式）
- OOB（Out-of-Band）は非対応

### ベースURL
`https://invoice.moneyforward.com/api/v3/`

### 主要エンドポイント
| リソース | エンドポイント | メソッド | 備考 |
|---------|---------------|---------|------|
| 取引先 | `/partners` | GET, POST | |
| 取引先詳細 | `/partners/{id}` | GET, PATCH, DELETE | |
| 取引先部門 | `/partners/{id}/departments` | GET | department_id取得用 |
| 品目 | `/items` | GET, POST | |
| 品目詳細 | `/items/{id}` | GET, PATCH, DELETE | |
| 見積書 | `/quotes` | GET, POST | インボイス対応 |
| 見積書詳細 | `/quotes/{id}` | GET, PATCH, DELETE | |
| 見積書PDF | `/quotes/{id}/pdf` | GET | |
| 見積書→請求書変換 | `/quotes/{id}/convert_to_billing` | POST | インボイス対応 |
| 請求書一覧 | `/billings` | GET | |
| インボイス請求書作成 | `/invoice_template_billings` | POST | **インボイス対応必須** |
| 請求書詳細 | `/billings/{id}` | GET, PATCH, DELETE | |
| 請求書PDF | `/billings/{id}/pdf` | GET | |
| 見積書→納品書 | `/delivery_slips/from_quote` | POST | **v3 API未サポート** |

### インボイス制度対応

2023年10月以降、インボイス制度対応の請求書を作成するには以下が必要:

1. **department_id**: 取引先の部門ID（`/partners/{id}/departments`で取得）
2. **excise**: 消費税区分（`ten_percent`, `eight_percent_as_reduced_tax_rate`等）

消費税区分:
| 値 | 説明 |
|----|------|
| `ten_percent` | 10% |
| `eight_percent_as_reduced_tax_rate` | 軽減税率8% |
| `eight_percent` | 8% |
| `untaxable` | 対象外 |
| `non_taxable` | 非課税 |

### レート制限
- 1秒あたり3リクエストまで
- 超過時: HTTP 429 + Retry-Afterヘッダー
- `src/api/client.ts`で自動制御

### 検索パラメータ
一覧取得APIでは以下のパラメータが使用可能:
- `page`: ページ番号
- `per_page`: 1ページあたりの件数
- `q`: 検索キーワード
- `from`, `to`: 日付範囲（YYYY-MM-DD）
- `partner_id`: 取引先IDで絞り込み
- `status`: ステータスで絞り込み（見積書）
- `payment_status`: 入金状態で絞り込み（請求書）

## 業務フロー

### フルフロー（見積書・納品書・請求書）
1. 見積書作成（`mf_create_quote`）
2. 納品書作成（**WebUIで手動作成** - API未サポート）
3. 請求書作成（`mf_convert_quote_to_billing`で見積書から変換）

### シンプルフロー
請求書を直接作成（`mf_create_billing`）

### 過去データ参照パターン
1. `mf_list_billings`で過去の請求書を検索
2. `mf_get_billing`で詳細取得
3. 内容を参考に`mf_create_billing`で新規作成（excise指定必須）

## 開発時の注意点

### ツール追加時
1. `src/types/index.ts`に型定義を追加
2. `src/api/`に対応するAPIモジュールを作成
3. `src/tools/`にMCPツールを作成
4. `src/index.ts`でツールをインポートして`allTools`に追加

### zodスキーマ
- 各ツールの`inputSchema`はzodで定義
- `zod-to-json-schema`でMCP向けJSON Schemaに変換

### エラーハンドリング
- 各ツールハンドラー内でtry-catchを使用
- エラー時は`content`にエラーメッセージを含めて返却

### テスト方法
1. `npm run build`でビルド
2. 環境変数を設定してClaude Desktopから接続
3. 各ツールを手動で実行して確認

## 認証フロー

### 初回認証
1. `mf_auth_start` を実行 → ローカルサーバー起動（ポート38080）
2. 表示されたURLをブラウザで開く
3. MoneyForwardでログイン・認可
4. コールバックでcodeを受け取り、自動でトークン交換
5. トークンをファイルに保存

### トークン保存
`~/.config/mf-invoice-mcp/tokens.json`に以下の形式で保存:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": 1234567890000,
  "scope": "mfc/invoice/data.read mfc/invoice/data.write"
}
```

### トークン更新
- アクセストークン期限切れ時は自動でリフレッシュ
- リフレッシュトークン期限切れ時は再認証が必要

## 今後の拡張候補
- 取引先・品目の作成/更新/削除ツール
- 定期請求書の対応
- Webhook対応（入金通知など）

## 既知の制限事項
- **納品書API**: v3 APIでは納品書関連のエンドポイントが提供されていないため、納品書の作成・取得はできません。WebUIで手動作成が必要です。
- **旧エンドポイント**: `/billings`へのPOSTや`/delivery_slips/from_quote`は404エラーを返します。インボイス対応には`/invoice_template_billings`を使用してください。
