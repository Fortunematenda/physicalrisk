import { CredentialEncryptionService } from './credential-encryption.service';

describe('CredentialEncryptionService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  const createService = () => {
    const config = { get: jest.fn((name: string) => (name === 'CONNECTOR_ENCRYPTION_KEY' ? key : undefined)) };
    const service = new CredentialEncryptionService(config as never);
    service.onModuleInit();
    return service;
  };

  it('encrypts and decrypts connector secrets', () => {
    const service = createService();
    const encrypted = service.encrypt('{"accessToken":"secret"}');
    expect(encrypted).not.toContain('secret');
    expect(service.decrypt(encrypted)).toBe('{"accessToken":"secret"}');
  });

  it('rejects invalid encryption keys', () => {
    const config = { get: jest.fn(() => 'too-short') };
    const service = new CredentialEncryptionService(config as never);
    expect(() => service.onModuleInit()).toThrow('CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes');
  });

  it('allows startup without a key but fails encrypt until configured', () => {
    const config = { get: jest.fn(() => undefined) };
    const service = new CredentialEncryptionService(config as never);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(() => service.encrypt('secret')).toThrow('CONNECTOR_ENCRYPTION_KEY must be configured');
  });
});
