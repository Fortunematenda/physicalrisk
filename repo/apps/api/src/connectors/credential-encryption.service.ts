import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ConnectorConfigurationError } from './connector-errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
export const CONNECTOR_ENCRYPTION_SETTING_KEY = 'connectors.encryptionKey';

@Injectable()
export class CredentialEncryptionService implements OnModuleInit {
  private key: Buffer | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    const fromEnv = this.config.get<string>('CONNECTOR_ENCRYPTION_KEY')?.trim();
    if (fromEnv) {
      this.key = this.resolveKey(fromEnv);
      return;
    }
    try {
      const row = await this.db.systemSettings.findOne({
        where: { key: CONNECTOR_ENCRYPTION_SETTING_KEY },
      });
      const stored = typeof row?.value === 'string'
        ? row.value
        : row?.value && typeof row.value === 'object' && 'key' in (row.value as object)
          ? String((row.value as { key?: unknown }).key ?? '')
          : '';
      if (stored.trim()) this.key = this.resolveKey(stored.trim());
    } catch {
      // DB may not be ready during very early boot; ensureKey() will retry lazily.
    }
  }

  encrypt(plaintext: string): string {
    const key = this.requireKeySyncOrThrow();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(payload: string): string {
    try {
      const key = this.requireKeySyncOrThrow();
      const buffer = Buffer.from(payload, 'base64');
      const iv = buffer.subarray(0, IV_LENGTH);
      const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
      const encrypted = buffer.subarray(IV_LENGTH + 16);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error) {
      if (error instanceof ConnectorConfigurationError) throw error;
      throw new ConnectorConfigurationError('Unable to decrypt connector credentials');
    }
  }

  /** Ensure a key exists (env, DB, or auto-generated) before encrypting OAuth tokens. */
  async ensureKey(): Promise<void> {
    if (this.key) return;
    const fromEnv = this.config.get<string>('CONNECTOR_ENCRYPTION_KEY')?.trim();
    if (fromEnv) {
      this.key = this.resolveKey(fromEnv);
      return;
    }
    const row = await this.db.systemSettings.findOne({
      where: { key: CONNECTOR_ENCRYPTION_SETTING_KEY },
    });
    const stored = typeof row?.value === 'string'
      ? row.value
      : row?.value && typeof row.value === 'object' && 'key' in (row.value as object)
        ? String((row.value as { key?: unknown }).key ?? '')
        : '';
    if (stored.trim()) {
      this.key = this.resolveKey(stored.trim());
      return;
    }
    const generated = randomBytes(32).toString('hex');
    await this.db.systemSettings.save(
      this.db.systemSettings.create({
        key: CONNECTOR_ENCRYPTION_SETTING_KEY,
        value: { key: generated },
        description: 'Auto-generated AES-256 key for connector credential encryption',
      }),
    );
    this.key = this.resolveKey(generated);
  }

  private requireKeySyncOrThrow(): Buffer {
    if (this.key) return this.key;
    const fromEnv = this.config.get<string>('CONNECTOR_ENCRYPTION_KEY')?.trim();
    if (fromEnv) {
      this.key = this.resolveKey(fromEnv);
      return this.key;
    }
    throw new ConnectorConfigurationError(
      'Connector encryption key is not ready. Save Google API settings once, or set CONNECTOR_ENCRYPTION_KEY.',
    );
  }

  private resolveKey(raw: string | undefined): Buffer {
    const value = raw?.trim();
    if (!value) {
      throw new ConnectorConfigurationError('CONNECTOR_ENCRYPTION_KEY must be configured (32 bytes as base64, hex, or utf8)');
    }
    if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
    try {
      const decoded = Buffer.from(value, 'base64');
      if (decoded.length === 32) return decoded;
    } catch {
      // fall through
    }
    const utf8 = Buffer.from(value, 'utf8');
    if (utf8.length === 32) return utf8;
    throw new ConnectorConfigurationError('CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
}
