# 開発への参加ガイド

## 開発環境のセットアップ

```bash
git clone <repo-url>
cd mf-invoice-mcp
npm install
```

## ビルド

```bash
npm run build
```

## 新しいツールの追加方法

### 1. 型定義の追加

`src/types/index.ts` に必要な型を追加:

```typescript
export interface NewResource {
  id: string;
  name: string;
  // ...
}

export interface CreateNewResourceParams {
  name: string;
  // ...
}
```

### 2. API関数の追加

`src/api/new-resource.ts` を作成:

```typescript
import { apiClient } from './client.js';
import type { NewResource, CreateNewResourceParams, ListResponse } from '../types/index.js';

export async function listNewResources(): Promise<ListResponse<NewResource>> {
  return apiClient.get<ListResponse<NewResource>>('/new_resources');
}

export async function createNewResource(params: CreateNewResourceParams): Promise<NewResource> {
  return apiClient.post<NewResource>('/new_resources', { new_resource: params });
}
```

### 3. MCPツールの追加

`src/tools/new-resource.ts` を作成:

```typescript
import { z } from 'zod';
import { listNewResources, createNewResource } from '../api/new-resource.js';

export const newResourceTools = {
  mf_list_new_resources: {
    description: '新リソース一覧を取得します',
    inputSchema: z.object({
      page: z.number().optional().describe('ページ番号'),
    }),
    handler: async (args: { page?: number }) => {
      try {
        const result = await listNewResources();
        return {
          content: [
            {
              type: 'text' as const,
              text: `一覧: ${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  },
};
```

### 4. エントリポイントへの登録

`src/index.ts` を編集:

```typescript
import { newResourceTools } from './tools/new-resource.js';

const allTools = {
  ...authTools,
  ...partnerTools,
  // ...
  ...newResourceTools,  // 追加
};
```

## コーディング規約

- TypeScript strict modeを使用
- zodでinputSchemaを定義
- エラーハンドリングは各ハンドラー内でtry-catch
- 日本語のユーザー向けメッセージ

## テスト方法

1. ビルド: `npm run build`
2. 環境変数を設定:
   ```bash
   export MF_CLIENT_ID="your_client_id"
   export MF_CLIENT_SECRET="your_client_secret"
   ```
3. Claude Desktopから接続してツールを実行

## コミットメッセージ

```
feat: 新機能の追加
fix: バグ修正
docs: ドキュメントのみの変更
refactor: リファクタリング
```

## プルリクエスト

1. フォークしてブランチを作成
2. 変更を実装
3. ビルドが通ることを確認
4. プルリクエストを作成
