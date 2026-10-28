import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { KeycloakAdminError } from './keycloak-admin';

type Row = { id: string; email: string; firstName: string; lastName: string; systemRole: string; isActive: boolean; passwordHash?: string };

const admin = { id: 'admin-1', email: 'wayne@physicalrisk.com', role: 'SUPER_ADMIN' };

function setup(opts: { configured?: boolean; legacy?: boolean } = {}) {
  const rows: Row[] = [];
  const pick = ({ passwordHash: _hash, ...rest }: Row) => rest;
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        rows.find((r) => (where.id ? r.id === where.id : r.email === where.email)) || null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row = { id: `u${rows.length + 1}`, ...data };
        rows.push(row);
        return pick(row);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        for (const [k, v] of Object.entries(data)) if (v !== undefined) (row as Record<string, unknown>)[k] = v;
        return pick(row);
      }),
    },
    membership: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const audit = { record: vi.fn() };
  const vars: Record<string, string> = {
    KEYCLOAK_ENABLED: 'true',
    ENABLE_LEGACY_LOGIN: opts.legacy ? 'true' : 'false',
    KEYCLOAK_ISSUER: 'http://auth.localhost/realms/physicalrisk',
    ...(opts.configured === false ? {} : { KEYCLOAK_ADMIN_CLIENT_ID: 'moss-user-admin', KEYCLOAK_ADMIN_CLIENT_SECRET: 'x' }),
  };
  const config = { get: (key: string) => vars[key] };
  const service = new UsersService(prisma as never, audit as never, config as never);
  const kc = {
    findUserByEmail: vi.fn(async () => null as null | { id: string; enabled?: boolean }),
    createUser: vi.fn(async () => 'kc-new'),
    updateUser: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    logoutUser: vi.fn(async () => undefined),
    realmRoleNames: vi.fn(async () => [] as string[]),
    setManagedRealmRole: vi.fn(async () => undefined),
    sendActionsEmail: vi.fn(async () => undefined),
  };
  if (opts.configured !== false) (service as unknown as { keycloak: unknown }).keycloak = kc;
  return { service, kc, rows, audit };
}

describe('User administration through Keycloak', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('reports Keycloak provisioning and the roles MOSS may grant', () => {
    const caps = ctx.service.capabilities(admin);
    expect(caps).toMatchObject({ localUserAdmin: false, keycloakProvisioning: true });
    expect(caps.assignableRoles).toEqual(['ANALYST', 'REVIEWER', 'CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR']);
  });

  it('keeps the console link only when no service account is configured', () => {
    const caps = setup({ configured: false }).service.capabilities(admin);
    expect(caps).toMatchObject({ localUserAdmin: false, keycloakProvisioning: false, assignableRoles: null });
    expect(caps.identityAdminUrl).toContain('/admin/master/console/');
  });

  it('keeps local password accounts when legacy login is on', () => {
    expect(setup({ legacy: true }).service.capabilities(admin)).toMatchObject({
      localUserAdmin: true,
      keycloakProvisioning: false,
    });
  });

  it('creates an analyst in Keycloak, sends the set-password email and mirrors the user locally', async () => {
    const created = await ctx.service.create(
      { email: ' New.Analyst@Example.com ', firstName: 'New', lastName: 'Analyst', systemRole: 'ANALYST' as never },
      admin,
    );
    expect(ctx.kc.createUser).toHaveBeenCalledWith({ email: 'new.analyst@example.com', firstName: 'New', lastName: 'Analyst' });
    expect(ctx.kc.setManagedRealmRole).toHaveBeenCalledWith('kc-new', 'moss_analyst', ['moss_analyst', 'moss_reviewer', 'moss_client']);
    expect(ctx.kc.sendActionsEmail).toHaveBeenCalledWith('kc-new', ['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
    expect(created).toMatchObject({ email: 'new.analyst@example.com', systemRole: 'ANALYST', isActive: true });
    expect(created.keycloak).toMatchObject({ linkedExisting: false, inviteSent: true });
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_CREATED', metadata: expect.objectContaining({ via: 'keycloak' }) }));
  });

  it('refuses to create administrators or any role Keycloak cannot express', async () => {
    for (const role of ['SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'SALES', 'AUDITOR']) {
      await expect(
        ctx.service.create({ email: 'x@example.com', firstName: 'X', lastName: 'Y', systemRole: role as never }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(ctx.kc.createUser).not.toHaveBeenCalled();
  });

  it('removes the new Keycloak account if the role cannot be assigned', async () => {
    ctx.kc.setManagedRealmRole.mockRejectedValueOnce(new KeycloakAdminError('denied', 403));
    await expect(
      ctx.service.create({ email: 'a@example.com', firstName: 'A', lastName: 'B', systemRole: 'ANALYST' as never }, admin),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(ctx.kc.deleteUser).toHaveBeenCalledWith('kc-new');
    expect(ctx.rows).toHaveLength(0);
  });

  it('still creates the user when the invitation email fails, and says so', async () => {
    ctx.kc.sendActionsEmail.mockRejectedValueOnce(new KeycloakAdminError('Keycloak error: Failed to send execute actions email', 500));
    const created = await ctx.service.create(
      { email: 'a@example.com', firstName: 'A', lastName: 'B', systemRole: 'REVIEWER' as never },
      admin,
    );
    expect(created.keycloak).toMatchObject({ inviteSent: false, inviteError: expect.stringContaining('email') });
    expect(ctx.rows).toHaveLength(1);
  });

  it('links an existing Keycloak account without emailing it, but never an administrator', async () => {
    ctx.kc.findUserByEmail.mockResolvedValue({ id: 'kc-old', enabled: true });
    const linked = await ctx.service.create(
      { email: 'old@example.com', firstName: 'O', lastName: 'L', systemRole: 'ANALYST' as never },
      admin,
    );
    expect(linked.keycloak).toMatchObject({ linkedExisting: true, inviteSent: false });
    expect(ctx.kc.createUser).not.toHaveBeenCalled();
    expect(ctx.kc.sendActionsEmail).not.toHaveBeenCalled();

    ctx.kc.realmRoleNames.mockResolvedValue(['moss_admin']);
    await expect(
      ctx.service.create({ email: 'boss@example.com', firstName: 'B', lastName: 'S', systemRole: 'ANALYST' as never }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('changes role, disables and signs out a user in Keycloak', async () => {
    ctx.rows.push({ id: 'u9', email: 'ana@example.com', firstName: 'Ana', lastName: 'L', systemRole: 'ANALYST', isActive: true });
    ctx.kc.findUserByEmail.mockResolvedValue({ id: 'kc-9' });
    const updated = await ctx.service.update('u9', { systemRole: 'REVIEWER' as never, isActive: false }, admin);
    expect(ctx.kc.updateUser).toHaveBeenCalledWith('kc-9', { firstName: undefined, lastName: undefined, enabled: false });
    expect(ctx.kc.setManagedRealmRole).toHaveBeenCalledWith('kc-9', 'moss_reviewer', expect.any(Array));
    expect(ctx.kc.logoutUser).toHaveBeenCalledWith('kc-9');
    expect(updated).toMatchObject({ systemRole: 'REVIEWER', isActive: false });
  });

  it('will not edit administrators or let an admin demote or deactivate themselves', async () => {
    ctx.rows.push({ id: 'u-boss', email: 'boss@example.com', firstName: 'B', lastName: 'S', systemRole: 'SUPER_ADMIN', isActive: true });
    await expect(ctx.service.update('u-boss', { isActive: false }, admin)).rejects.toBeInstanceOf(ForbiddenException);

    ctx.rows.push({ id: 'admin-1', email: admin.email, firstName: 'W', lastName: 'A', systemRole: 'REVIEWER', isActive: true });
    await expect(ctx.service.update('admin-1', { isActive: false }, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.kc.updateUser).not.toHaveBeenCalled();
  });

  it('does not change the local record when Keycloak rejects the update', async () => {
    ctx.rows.push({ id: 'u9', email: 'ana@example.com', firstName: 'Ana', lastName: 'L', systemRole: 'ANALYST', isActive: true });
    ctx.kc.findUserByEmail.mockResolvedValue({ id: 'kc-9' });
    ctx.kc.setManagedRealmRole.mockRejectedValueOnce(new KeycloakAdminError('Keycloak could not be reached.', 503));
    await expect(ctx.service.update('u9', { systemRole: 'REVIEWER' as never }, admin)).rejects.toBeInstanceOf(BadGatewayException);
    expect(ctx.rows[0].systemRole).toBe('ANALYST');
  });

  it('sends a password reset email through Keycloak instead of setting a password', async () => {
    ctx.rows.push({ id: 'u9', email: 'ana@example.com', firstName: 'Ana', lastName: 'L', systemRole: 'ANALYST', isActive: true });
    ctx.kc.findUserByEmail.mockResolvedValue({ id: 'kc-9' });
    await ctx.service.sendPasswordEmail('u9', admin);
    expect(ctx.kc.sendActionsEmail).toHaveBeenCalledWith('kc-9', ['UPDATE_PASSWORD']);
    await expect(ctx.service.resetPassword('u9', 'whatever123', admin)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
