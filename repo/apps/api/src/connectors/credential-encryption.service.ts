import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConnectorConfigurationError } from './connector-errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class CredentialEncryptionService implements OnModuleInit {
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('CONNECTOR_ENCRYPTION_KEY')?.trim();
    if (raw) {
      this.key = this.resolveKey(raw);
    }
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(payload: string): string {
    try {
      const key = this.requireKey();
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

  private requireKey(): Buffer {
    if (this.key) return this.key;
    this.key = this.resolveKey(this.config.get<string>('CONNECTOR_ENCRYPTION_KEY'));
    return this.key;
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
