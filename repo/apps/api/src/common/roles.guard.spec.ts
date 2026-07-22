import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { UserRole } from '../database/entities';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const config = { get: jest.fn() };
  const guard = new RolesGuard(reflector as any, config as any);

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('false');
  });

  it('allows when AUTH_DISABLED is true', () => {
    config.get.mockReturnValue('true');
    expect(guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: null }) }),
    } as any)).toBe(true);
  });

  it('allows authorised ADMIN users', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.IMPORTER]);
    expect(guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.ADMIN } }) }),
    } as any)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('rejects unauthorised users with PERMISSION_DENIED', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.IMPORTER]);
    expect(() => guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.VIEWER } }) }),
    } as any)).toThrow(ForbiddenException);
  });
});
