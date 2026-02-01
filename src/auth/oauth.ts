import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import type { OAuthTokens, OAuthConfig } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mf-invoice-mcp');
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json');

const AUTH_URL = 'https://api.biz.moneyforward.com/authorize';
const TOKEN_URL = 'https://api.biz.moneyforward.com/token';
const DEFAULT_PORT = 8080;
const DEFAULT_REDIRECT_URI = `http://localhost:${DEFAULT_PORT}/callback`;

export class OAuthManager {
  private config: OAuthConfig;
  private tokens: OAuthTokens | null = null;
  private server: http.Server | null = null;
  private port: number;

  constructor(config: OAuthConfig) {
    this.config = config;
    this.port = parseInt(process.env.MF_CALLBACK_PORT || String(DEFAULT_PORT), 10);
    this.loadTokens();
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        const data = fs.readFileSync(TOKENS_FILE, 'utf-8');
        this.tokens = JSON.parse(data);
      }
    } catch {
      this.tokens = null;
    }
  }

  private saveTokens(tokens: OAuthTokens): void {
    this.ensureConfigDir();
    // Add expiration timestamp
    tokens.expires_at = Date.now() + tokens.expires_in * 1000;
    this.tokens = tokens;
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  }

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.getRedirectUri(),
      scope: 'mfc/invoice/data.read mfc/invoice/data.write',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.getRedirectUri(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await response.json() as OAuthTokens;
    this.saveTokens(tokens);
    return tokens;
  }

  async refreshToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available. Please re-authenticate.');
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json() as OAuthTokens;
    this.saveTokens(tokens);
    return tokens;
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('Not authenticated. Please run mf_auth_start first.');
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = this.tokens.expires_at || 0;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      await this.refreshToken();
    }

    return this.tokens.access_token;
  }

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  getAuthStatus(): { authenticated: boolean; expiresAt?: number } {
    if (!this.tokens) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      expiresAt: this.tokens.expires_at,
    };
  }

  clearTokens(): void {
    this.tokens = null;
    if (fs.existsSync(TOKENS_FILE)) {
      fs.unlinkSync(TOKENS_FILE);
    }
  }

  getRedirectUri(): string {
    return this.config.redirectUri || `http://localhost:${this.port}/callback`;
  }

  async startAuthFlow(): Promise<{ authUrl: string; tokenPromise: Promise<OAuthTokens> }> {
    // Stop existing server if running
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    const authUrl = this.getAuthorizationUrl();

    const tokenPromise = new Promise<OAuthTokens>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.server) {
          this.server.close();
          this.server = null;
        }
        reject(new Error('認証がタイムアウトしました（5分）'));
      }, 5 * 60 * 1000); // 5 minutes timeout

      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '', `http://localhost:${this.port}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body><h1>認証エラー</h1><p>${error}</p></body></html>`);
            clearTimeout(timeoutId);
            this.server?.close();
            this.server = null;
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (code) {
            try {
              const tokens = await this.exchangeCode(code);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<html><body><h1>認証成功</h1><p>このウィンドウを閉じてください。</p></body></html>`);
              clearTimeout(timeoutId);
              this.server?.close();
              this.server = null;
              resolve(tokens);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<html><body><h1>トークン取得エラー</h1><p>${err instanceof Error ? err.message : String(err)}</p></body></html>`);
              clearTimeout(timeoutId);
              this.server?.close();
              this.server = null;
              reject(err);
            }
            return;
          }

          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>エラー</h1><p>認証コードがありません</p></body></html>`);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.server.listen(this.port, () => {
        // Server started
      });

      this.server.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`サーバー起動エラー: ${err.message}`));
      });
    });

    return { authUrl, tokenPromise };
  }

  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// Singleton instance
let oauthManager: OAuthManager | null = null;

export function getOAuthManager(): OAuthManager {
  if (!oauthManager) {
    const clientId = process.env.MF_CLIENT_ID;
    const clientSecret = process.env.MF_CLIENT_SECRET;
    const port = parseInt(process.env.MF_CALLBACK_PORT || String(DEFAULT_PORT), 10);
    const redirectUri = process.env.MF_REDIRECT_URI || `http://localhost:${port}/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('MF_CLIENT_ID and MF_CLIENT_SECRET environment variables are required');
    }

    oauthManager = new OAuthManager({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
  return oauthManager;
}
