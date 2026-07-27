import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

export const GOOGLE_OAUTH_SETTING_KEY = 'connectors.googleOAuth';

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleOAuthPublicView = {
  clientId: string;
  redirectUri: string;
  clientSecretSet: boolean;
  source: 'database' | 'environment' | 'none';
  configured: boolean;
};

export type UpdateGoogleOAuthInput = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

@Injectable()
export class GoogleOAuthSettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getPublicView(): Promise<GoogleOAuthPublicView> {
    const { config, source } = await this.resolve();
    return {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      clientSecretSet: Boolean(config.clientSecret),
      source,
      configured: Boolean(config.clientId && config.clientSecret),
    };
  }

  async resolve(): Promise<{ config: GoogleOAuthConfig; source: 'database' | 'environment' | 'none' }> {
    const row = await this.db.systemSettings.findOne({ where: { key: GOOGLE_OAUTH_SETTING_KEY } });
    const stored = this.parseStored(row?.value);
    const env = this.envConfig();

    const hasStored = Boolean(stored.clientId || stored.clientSecret || stored.redirectUri);
    if (hasStored) {
      return {
        config: {
          clientId: stored.clientId || env.clientId,
          clientSecret: stored.clientSecret || env.clientSecret,
          redirectUri: stored.redirectUri || env.redirectUri,
        },
        source: 'database',
      };
    }

    if (env.clientId || env.clientSecret) {
      return { config: env, source: 'environment' };
    }

    return { config: env, source: 'none' };
  }

  async requireCredentials(): Promise<GoogleOAuthConfig> {
    const { config } = await this.resolve();
    if (!config.clientId?.trim() || !config.clientSecret?.trim()) {
      throw new BadRequestException(
        'Google Drive is not configured. Add Client ID and Client Secret under Source Connections → Google API settings.',
      );
    }
    return {
      clientId: config.clientId.trim(),
      clientSecret: config.clientSecret.trim(),
      redirectUri: config.redirectUri.trim(),
    };
  }

  async update(input: UpdateGoogleOAuthInput, userId?: string) {
    const { config: current } = await this.resolve();
    const row = await this.db.systemSettings.findOne({ where: { key: GOOGLE_OAUTH_SETTING_KEY } });
    const stored = this.parseStored(row?.value);

    const secretProvided = typeof input.clientSecret === 'string' && input.clientSecret.trim().length > 0;
    const next: GoogleOAuthConfig = {
      clientId: input.clientId !== undefined ? String(input.clientId).trim() : (stored.clientId || current.clientId),
      clientSecret: secretProvided
        ? String(input.clientSecret).trim()
        : (stored.clientSecret || current.clientSecret),
      redirectUri: input.redirectUri !== undefined
        ? String(input.redirectUri).trim()
        : (stored.redirectUri || current.redirectUri),
    };

    if (!next.clientId) {
      throw new BadRequestException('Google Client ID is required.');
    }
    if (!next.clientSecret) {
      throw new BadRequestException('Google Client Secret is required (enter it once to save).');
    }
    if (!next.redirectUri) {
      throw new BadRequestException('Redirect URI is required.');
    }
    try {
      // eslint-disable-next-line no-new
      new URL(next.redirectUri);
    } catch {
      throw new BadRequestException('Redirect URI must be a valid URL.');
    }

    if (!row) {
      await this.db.systemSettings.save(
        this.db.systemSettings.create({
          key: GOOGLE_OAUTH_SETTING_KEY,
          value: next,
          description: 'Google Drive OAuth client credentials (admin UI)',
        }),
      );
    } else {
      row.value = next;
      row.description = 'Google Drive OAuth client credentials (admin UI)';
      await this.db.systemSettings.save(row);
    }

    return this.getPublicView();
  }

  private envConfig(): GoogleOAuthConfig {
    return {
      clientId: this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() ?? '',
      clientSecret: this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim() ?? '',
      redirectUri: this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim()
        ?? 'https://repo.physicalrisk.com/api/connectors/google-drive/callback',
    };
  }

  private parseStored(value: unknown): Partial<GoogleOAuthConfig> {
    if (!value || typeof value !== 'object') return {};
    const raw = value as Record<string, unknown>;
    return {
      clientId: typeof raw.clientId === 'string' ? raw.clientId : '',
      clientSecret: typeof raw.clientSecret === 'string' ? raw.clientSecret : '',
      redirectUri: typeof raw.redirectUri === 'string' ? raw.redirectUri : '',
    };
  }
}
