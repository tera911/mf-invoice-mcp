import { z } from 'zod';
import { getOAuthManager } from '../auth/oauth.js';

export const authTools = {
  mf_auth_status: {
    description: '認証状態を確認します',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        const oauthManager = getOAuthManager();
        const status = oauthManager.getAuthStatus();

        if (status.authenticated) {
          const expiresAt = status.expiresAt
            ? new Date(status.expiresAt).toISOString()
            : 'unknown';
          return {
            content: [
              {
                type: 'text' as const,
                text: `認証済み\nトークン有効期限: ${expiresAt}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: '未認証です。mf_auth_startを実行して認証を開始してください。',
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

  mf_auth_start: {
    description: 'OAuth認証を開始します。ローカルサーバーを起動してコールバックを待ちます。',
    inputSchema: z.object({
      wait: z.boolean().optional().describe('trueの場合、認証完了まで待機します（デフォルト: false）'),
    }),
    handler: async (args: { wait?: boolean }) => {
      try {
        const oauthManager = getOAuthManager();
        const { authUrl, tokenPromise } = await oauthManager.startAuthFlow();

        if (args.wait) {
          // Wait for authentication to complete
          const waitMessage = {
            content: [
              {
                type: 'text' as const,
                text: `認証サーバーを起動しました。\n\n以下のURLをブラウザで開いて認証してください:\n${authUrl}\n\n認証完了を待機中...`,
              },
            ],
          };

          try {
            await tokenPromise;
            return {
              content: [
                {
                  type: 'text' as const,
                  text: '認証が完了しました。MoneyForward クラウド請求書 APIを使用できます。',
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `認証エラー: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }
        }

        // Return immediately with auth URL
        return {
          content: [
            {
              type: 'text' as const,
              text: `認証サーバーを起動しました (ポート: ${process.env.MF_CALLBACK_PORT || '8080'})\n\n以下のURLをブラウザで開いて認証してください:\n${authUrl}\n\n認証が完了すると自動的にトークンが保存されます。`,
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

  mf_auth_callback: {
    description: '認証コードを使用してアクセストークンを取得します',
    inputSchema: z.object({
      code: z.string().describe('認可後に取得した認証コード'),
    }),
    handler: async (args: { code: string }) => {
      try {
        const oauthManager = getOAuthManager();
        await oauthManager.exchangeCode(args.code);

        return {
          content: [
            {
              type: 'text' as const,
              text: '認証が完了しました。MoneyForward クラウド請求書 APIを使用できます。',
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `認証エラー: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  },

  mf_refresh_token: {
    description: 'アクセストークンをリフレッシュします',
    inputSchema: z.object({}),
    handler: async () => {
      try {
        const oauthManager = getOAuthManager();
        await oauthManager.refreshToken();

        return {
          content: [
            {
              type: 'text' as const,
              text: 'トークンを更新しました。',
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `トークン更新エラー: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  },
};
