import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export class RepositoryApiClient {
  constructor(private readonly authHeader?: string) {}

  private headers() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': randomUUID(),
    };
    if (this.authHeader) headers.Authorization = this.authHeader;
    else if (config.repoMcpApiKey) headers.Authorization = `Bearer ${config.repoMcpApiKey}`;
    return headers;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${config.repoApiUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload as { message?: string }).message || response.statusText;
      const code = (payload as { code?: string }).code || 'REPO_API_ERROR';
      throw new Error(`${code}: ${message}`);
    }
    return payload as T;
  }
}
