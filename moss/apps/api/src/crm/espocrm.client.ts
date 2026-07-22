import https from 'https';
import axios, { AxiosInstance, AxiosRequestConfig, isAxiosError } from 'axios';
import type { EspoCrmRuntimeConfig } from './espocrm.config';
import { redactSecrets, validateEspoBaseUrl } from './espocrm.config';
import type {
  EspoConnectionTestResult,
  EspoHttpMethod,
  EspoListResponse,
  EspoRecord,
  EspoRequestResult,
  EspoSafeError,
} from './espocrm.types';

export class EspoCrmHttpError extends Error {
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly code: string;

  constructor(safe: EspoSafeError) {
    super(safe.message);
    this.name = 'EspoCrmHttpError';
    this.retryable = safe.retryable;
    this.statusCode = safe.statusCode;
    this.code = safe.code;
  }
}

function truncate(value: unknown, max = 2000): unknown {
  const redacted = redactSecrets(value);
  const asText = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
  if (!asText) return null;
  if (asText.length <= max) return redacted;
  return `${asText.slice(0, max)}…`;
}

export function classifyEspoError(error: unknown): EspoSafeError {
  const axiosLike =
    isAxiosError(error) ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { isAxiosError?: boolean }).isAxiosError === true);

  if (axiosLike) {
    const err = error as {
      code?: string;
      message?: string;
      response?: { status?: number; data?: { message?: string } };
    };
    const statusCode = err.response?.status;
    const data = err.response?.data;
    const rawMessage = String(data?.message || err.message || 'EspoCRM request failed');
    const message = String(redactSecrets(rawMessage)).slice(0, 500);

    if (err.code === 'ECONNABORTED' || /timeout/i.test(message)) {
      return { retryable: true, statusCode, code: 'TIMEOUT', message: 'EspoCRM request timed out.' };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return { retryable: true, statusCode, code: 'DNS_FAILURE', message: 'EspoCRM host could not be resolved.' };
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'EHOSTUNREACH') {
      return { retryable: true, statusCode, code: 'NETWORK_ERROR', message: 'EspoCRM is unreachable.' };
    }
    if (/certificate|SSL|TLS|UNABLE_TO_VERIFY/i.test(message) || err.code === 'CERT_HAS_EXPIRED') {
      return { retryable: false, statusCode, code: 'SSL_FAILURE', message: 'EspoCRM SSL/TLS verification failed.' };
    }
    if (statusCode === 401) {
      return { retryable: false, statusCode, code: 'AUTH_FAILED', message: 'EspoCRM authentication failed (401).' };
    }
    if (statusCode === 403) {
      return { retryable: false, statusCode, code: 'FORBIDDEN', message: 'EspoCRM permission denied (403).' };
    }
    if (statusCode === 404) {
      return { retryable: false, statusCode, code: 'NOT_FOUND', message: 'EspoCRM API path or record not found (404).' };
    }
    if (statusCode === 400 || statusCode === 422) {
      return { retryable: false, statusCode, code: 'VALIDATION', message: message || 'EspoCRM validation failed.' };
    }
    if (statusCode === 429 || (statusCode != null && statusCode >= 500)) {
      return {
        retryable: true,
        statusCode,
        code: statusCode === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR',
        message: `EspoCRM returned HTTP ${statusCode}.`,
      };
    }
    return { retryable: true, statusCode, code: 'REQUEST_FAILED', message };
  }

  const message = String(redactSecrets((error as Error)?.message || error)).slice(0, 500);
  return { retryable: false, code: 'UNKNOWN', message };
}

export class EspoCrmClient {
  private readonly http: AxiosInstance;
  private readonly allowedHost: string;

  constructor(private readonly cfg: EspoCrmRuntimeConfig) {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const parsed = validateEspoBaseUrl(base || 'https://invalid.example', process.env.NODE_ENV || 'development');
    this.allowedHost = parsed.hostname.toLowerCase();

    this.http = axios.create({
      baseURL: `${base}/api/v1`,
      timeout: cfg.timeoutMs,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': cfg.apiKey,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: cfg.verifySsl }),
      validateStatus: () => true,
    });
  }

  private assertHostSafe(urlOrPath: string) {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const target = new URL(urlOrPath);
      if (target.hostname.toLowerCase() !== this.allowedHost) {
        throw Object.assign(new Error('Blocked request to non-configured EspoCRM host (SSRF protection).'), {
          code: 'SSRF_BLOCKED',
        });
      }
    }
  }

  async request<T = EspoRecord>(
    method: EspoHttpMethod,
    path: string,
    options?: { data?: Record<string, unknown>; params?: Record<string, unknown> },
  ): Promise<EspoRequestResult<T>> {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    this.assertHostSafe(normalisedPath);
    const started = Date.now();
    const config: AxiosRequestConfig = {
      method,
      url: normalisedPath,
      data: options?.data,
      params: options?.params,
    };

    try {
      const response = await this.http.request<T>(config);
      const durationMs = Date.now() - started;
      if (response.status >= 400) {
        const data = response.data as
          | { message?: string; messageBody?: string; reasonPhrase?: string }
          | string
          | undefined;
        const raw =
          typeof data === 'string'
            ? data
            : data?.message ||
              data?.messageBody ||
              data?.reasonPhrase ||
              (data ? JSON.stringify(data) : '') ||
              `EspoCRM HTTP ${response.status}`;
        const message = String(redactSecrets(raw)).slice(0, 500);
        throw new EspoCrmHttpError({
          retryable: response.status === 429 || response.status >= 500,
          statusCode: response.status,
          code:
            response.status === 401
              ? 'AUTH_FAILED'
              : response.status === 403
                ? 'FORBIDDEN'
                : response.status === 404
                  ? 'NOT_FOUND'
                  : response.status === 400 || response.status === 422
                    ? 'VALIDATION'
                    : response.status === 429
                      ? 'RATE_LIMITED'
                      : response.status >= 500
                        ? 'SERVER_ERROR'
                        : 'REQUEST_FAILED',
          message:
            response.status === 401
              ? 'EspoCRM authentication failed (401).'
              : response.status === 403
                ? 'EspoCRM permission denied (403).'
                : response.status === 404
                  ? 'EspoCRM API path or record not found (404).'
                  : message,
        });
      }
      return { data: response.data, statusCode: response.status, durationMs };
    } catch (error) {
      if (error instanceof EspoCrmHttpError) throw error;
      throw new EspoCrmHttpError(classifyEspoError(error));
    }
  }

  get<T = EspoRecord>(path: string, params?: Record<string, unknown>) {
    return this.request<T>('GET', path, { params });
  }

  post<T = EspoRecord>(path: string, data: Record<string, unknown>) {
    return this.request<T>('POST', path, { data });
  }

  put<T = EspoRecord>(path: string, data: Record<string, unknown>) {
    return this.request<T>('PUT', path, { data });
  }

  delete<T = EspoRecord>(path: string) {
    return this.request<T>('DELETE', path);
  }

  async findOne<T extends EspoRecord = EspoRecord>(entity: string, id: string) {
    const result = await this.get<T>(`/${entity}/${id}`);
    return result.data;
  }

  private equalsWhere(attribute: string, value: string) {
    return {
      maxSize: 5,
      'where[0][type]': 'equals',
      'where[0][attribute]': attribute,
      'where[0][value]': value,
    };
  }

  private extractRecords<T extends EspoRecord>(data: unknown): T[] {
    if (Array.isArray(data)) {
      return data as T[];
    }

    if (!data || typeof data !== 'object') {
      return [];
    }

    const response = data as {
      list?: T[];
      data?: T[] | { list?: T[] };
      id?: string;
    };

    if (Array.isArray(response.list)) {
      return response.list;
    }

    if (Array.isArray(response.data)) {
      return response.data;
    }

    if (
      response.data &&
      typeof response.data === 'object' &&
      Array.isArray(response.data.list)
    ) {
      return response.data.list;
    }

    if (response.id) {
      return [data as T];
    }

    return [];
  }

    async findByExternalId<T extends EspoRecord = EspoRecord>(
    entity: string,
    field: string,
    value: string,
  ): Promise<T | null> {
    const result = await this.get<unknown>(
      `/${entity}`,
      this.equalsWhere(field, value),
    );

    return this.extractRecords<T>(result.data)[0] || null;
  }

  async findByExactName<T extends EspoRecord = EspoRecord>(
    entity: string,
    name: string,
  ): Promise<T | null> {
    const result = await this.get<unknown>(
      `/${entity}`,
      this.equalsWhere('name', name),
    );

    const expected = name.trim().toLowerCase();

    return (
      this.extractRecords<T>(result.data).find(
        (row) =>
          String(row.name || '').trim().toLowerCase() === expected,
      ) || null
    );
  }

  async findByEmail<T extends EspoRecord = EspoRecord>(
    entity: string,
    email: string,
  ): Promise<T | null> {
    const result = await this.get<unknown>(
      `/${entity}`,
      this.equalsWhere('emailAddress', email),
    );

    const expected = email.trim().toLowerCase();

    return (
      this.extractRecords<T>(result.data).find(
        (row) =>
          String(row.emailAddress || '').trim().toLowerCase() === expected,
      ) || null
    );
  }

  async testConnection(): Promise<EspoConnectionTestResult> {
    const started = Date.now();
    try {
      const app = await this.get<EspoRecord>('/App/user');
      const name =
        String(app.data.userName || app.data.name || '').trim() ||
        String((app.data.user as { name?: string } | undefined)?.name || '').trim() ||
        null;
      return {
        success: true,
        statusCode: app.statusCode,
        responseTimeMs: Date.now() - started,
        authenticatedUserName: name,
        message: name ? `Authenticated as ${name}` : 'EspoCRM connection succeeded.',
      };
    } catch (primary) {
      try {
        const fallback = await this.get<EspoListResponse>('/Account', { maxSize: 1 });
        return {
          success: true,
          statusCode: fallback.statusCode,
          responseTimeMs: Date.now() - started,
          authenticatedUserName: null,
          message: 'EspoCRM connection succeeded.',
        };
      } catch {
        const classified = primary as EspoSafeError;
        return {
          success: false,
          statusCode: classified.statusCode,
          responseTimeMs: Date.now() - started,
          authenticatedUserName: null,
          message: classified.message,
          errorCode: classified.code,
        };
      }
    }
  }

  safeSummary(payload: unknown) {
    return truncate(payload, 1500);
  }
}

export function buildApiBase(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1`;
}
