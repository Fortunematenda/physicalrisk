import { describe, expect, it, vi } from 'vitest';
import { DeletedUserError, SsoUserSyncService } from './sso-user-sync.service';

function setup(deletedAt: Date | null) {
  const row = { id: 'u1', email: 'ana@example.com', deletedAt, lastLoginAt: new Date() };
  const prisma = {
    user: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return { id: row.id, email: row.email };
      }),
    },
  };
  const sessions = { recordSignIn: vi.fn(), touchLastSeen: vi.fn() };
  return { row, prisma, service: new SsoUserSyncService(prisma as never, sessions as never) };
}

describe('SSO sync for deleted users', () => {
  const deletedAt = new Date('2026-10-28T18:00:00Z');
  const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

  it('rejects a token issued before the user was deleted', async () => {
    const { service, prisma } = setup(deletedAt);
    await expect(
      service.sync({ email: 'ana@example.com', role: 'ANALYST', issuedAt: seconds(deletedAt) - 60 }),
    ).rejects.toBeInstanceOf(DeletedUserError);
    await expect(service.sync({ email: 'ana@example.com', role: 'ANALYST' })).rejects.toBeInstanceOf(DeletedUserError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('restores the user after a new sign-in', async () => {
    const { service, row } = setup(deletedAt);
    await service.sync({ email: 'ana@example.com', role: 'ANALYST', issuedAt: seconds(deletedAt) + 60 });
    expect(row.deletedAt).toBeNull();
  });
});
