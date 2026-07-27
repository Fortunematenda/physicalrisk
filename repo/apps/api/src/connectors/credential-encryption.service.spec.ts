import { CredentialEncryptionService } from './credential-encryption.service';

describe('CredentialEncryptionService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  const createService = (envKey?: string) => {
    const config = {
      get: jest.fn((name: string) => (name === 'CONNECTOR_ENCRYPTION_KEY' ? envKey : undefined)),
    };
    const db = {
      systemSettings: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((row) => row),
        save: jest.fn(async (row) => row),
      },
    };
    const service = new CredentialEncryptionService(config as never, db as never);
    return { service, config, db };
  };

  it('encrypts and decrypts connector secrets', async () => {
    const { service } = createService(key);
    await service.onModuleInit();
    const encrypted = service.encrypt('{"accessToken":"secret"}');
    expect(encrypted).not.toContain('secret');
    expect(service.decrypt(encrypted)).toBe('{"accessToken":"secret"}');
  });

  it('rejects invalid encryption keys from env', async () => {
    const { service } = createService('too-short');
    await expect(service.onModuleInit()).rejects.toThrow(
      'CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  });

  it('allows startup without a key but fails encrypt until configured', async () => {
    const { service } = createService(undefined);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(() => service.encrypt('secret')).toThrow(/encryption key is not ready|must be configured/);
  });

  it('auto-generates and stores a key when ensureKey is called', async () => {
    const { service, db } = createService(undefined);
    await service.onModuleInit();
    await service.ensureKey();
    expect(db.systemSettings.save).toHaveBeenCalled();
    const encrypted = service.encrypt('hello');
    expect(service.decrypt(encrypted)).toBe('hello');
  });
});
