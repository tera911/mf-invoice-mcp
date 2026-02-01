import { getOAuthManager } from '../auth/oauth.js';
import type { ApiError } from '../types/index.js';

const BASE_URL = 'https://invoice.moneyforward.com/api/v3';
const RATE_LIMIT = 3; // requests per second
const RATE_WINDOW = 1000; // 1 second in ms

class RateLimiter {
  private timestamps: number[] = [];

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove timestamps older than the rate window
    this.timestamps = this.timestamps.filter(t => now - t < RATE_WINDOW);

    if (this.timestamps.length >= RATE_LIMIT) {
      // Calculate wait time until oldest timestamp expires
      const oldestTimestamp = this.timestamps[0];
      const waitTime = RATE_WINDOW - (now - oldestTimestamp) + 10; // +10ms buffer

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Recursively check again after waiting
        return this.waitForSlot();
      }
    }

    this.timestamps.push(Date.now());
  }
}

const rateLimiter = new RateLimiter();

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export class ApiClient {
  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    await rateLimiter.waitForSlot();

    const oauthManager = getOAuthManager();
    const accessToken = await oauthManager.getAccessToken();

    const url = new URL(`${BASE_URL}${endpoint}`);

    // Add query parameters
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit exceeded - wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.request<T>(endpoint, options);
      }

      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json() as ApiError;
        errorMessage = `${errorMessage}: ${errorBody.message || JSON.stringify(errorBody)}`;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Singleton instance
export const apiClient = new ApiClient();
