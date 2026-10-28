import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CrmController } from './crm.controller';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type Handler = keyof CrmController;

function contextFor(handler: Handler, role: string): ExecutionContext {
  return {
    getHandler: () => CrmController.prototype[handler] as unknown as () => unknown,
    getClass: () => CrmController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', email: 'u@example.com', role } }) }),
  } as unknown as ExecutionContext;
}

function allowed(handler: Handler, role: string) {
  const guard = new RolesGuard(new Reflector());
  try {
    return guard.canActivate(contextFor(handler, role));
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

const ALL_ROLES = [
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'AUDITOR',
  'CLIENT_EXECUTIVE',
  'CLIENT_CONTRIBUTOR',
];

function permitted(handler: Handler) {
  return ALL_ROLES.filter((role) => allowed(handler, role));
}

describe('CRM integration endpoint authorisation', () => {
  it('requires authentication and role checks on every route', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CrmController) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('keeps technical settings, connection tests and retries administrator-only', () => {
    for (const handler of ['settings', 'updateSettings', 'test', 'retryByLog', 'retry', 'retryFailed', 'process'] as Handler[]) {
      expect(permitted(handler), handler).toEqual(['SUPER_ADMIN']);
    }
  });

  it('limits sync history and job details to administrators and analysts', () => {
    expect(permitted('history')).toEqual(['SUPER_ADMIN', 'ANALYST']);
    expect(permitted('historyJob')).toEqual(['SUPER_ADMIN', 'ANALYST']);
  });

  it('limits status and the CRM link to existing internal CRM roles', () => {
    for (const handler of ['status', 'access'] as Handler[]) {
      expect(permitted(handler), handler).toEqual(['SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES']);
    }
  });

  it('never lets client users reach any CRM integration route', () => {
    const handlers = Object.getOwnPropertyNames(CrmController.prototype).filter(
      (name) => name !== 'constructor',
    ) as Handler[];
    for (const handler of handlers) {
      expect(allowed(handler, 'CLIENT_EXECUTIVE'), handler).toBe(false);
      expect(allowed(handler, 'CLIENT_CONTRIBUTOR'), handler).toBe(false);
    }
  });
});
