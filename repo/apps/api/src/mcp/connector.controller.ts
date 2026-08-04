import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/public.decorator';
import { DatabaseService } from '../database/database.service';
import { ConnectorImportJobStatus, McpIntegration } from '../database/entities';
import {
  MCP_INTEGRATION_KEY,
  MCP_SESSION_ID_KEY,
  McpAuthGuard,
} from './mcp-auth.guard';
import { ConnectorImportJobService } from './connector-import-job.service';
import { ConnectorSessionService } from './connector-session.service';
import {
  accessTokenExpiresAtMs,
  sessionIdFromAccessToken,
  sessionIdFromApiKey,
} from './mcp-token.util';
import { Request } from 'express';

type ConnectorRequest = Request & {
  [MCP_INTEGRATION_KEY]?: McpIntegration;
  [MCP_SESSION_ID_KEY]?: string;
};

@ApiTags('connector')
@Controller('connector')
export class ConnectorController {
  constructor(private readonly sessions: ConnectorSessionService) {}

  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Get('session/status')
  async sessionStatus(@Req() request: ConnectorRequest) {
    const sessionId = request[MCP_SESSION_ID_KEY] ?? null;
    return this.sessions.status(sessionId, request[MCP_INTEGRATION_KEY] ?? null);
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Post('session/heartbeat')
  async sessionHeartbeat(
    @Req() request: ConnectorRequest,
    @Body() body: { refreshToken?: string; accessToken?: string } = {},
  ) {
    const sessionId = request[MCP_SESSION_ID_KEY];
    if (!sessionId) {
      return {
        connected: false,
        authenticated: false,
        message: 'No connector session id derived from the Bearer token',
      };
    }
    return this.sessions.heartbeat(sessionId, {
      refreshToken: body.refreshToken,
      accessToken: body.accessToken,
    });
  }

  /** Optional: store a refresh token for server-side refresh (tests / advanced clients). */
  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Post('session/register-refresh')
  async registerRefresh(
    @Req() request: ConnectorRequest,
    @Body() body: { refreshToken: string; refreshExpiresAt?: string },
  ) {
    const sessionId = request[MCP_SESSION_ID_KEY];
    if (!sessionId) {
      return { success: false, errorCode: 'CONNECTOR_SESSION_NOT_FOUND' };
    }
    await this.sessions.registerRefreshToken(
      sessionId,
      body.refreshToken,
      body.refreshExpiresAt ? new Date(body.refreshExpiresAt) : undefined,
    );
    return { success: true, sessionId, refreshTokenStored: true };
  }
}

@ApiTags('import-jobs')
@Controller('import-jobs')
export class ConnectorImportJobsController {
  constructor(private readonly importJobs: ConnectorImportJobService) {}

  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Post()
  async create(
    @Req() request: ConnectorRequest,
    @Body() body: {
      workspaceCode?: string;
      totalDocuments?: number;
      importJobIds?: string[];
      metadata?: Record<string, unknown>;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const job = await this.importJobs.createJob({
      workspaceCode: body.workspaceCode,
      userId: request[MCP_INTEGRATION_KEY]?.createdBy?.id,
      totalDocuments: body.totalDocuments,
      importJobIds: body.importJobIds,
      metadata: {
        ...(body.metadata ?? {}),
        idempotencyKey: idempotencyKey ?? null,
      },
    });
    return this.importJobs.toView(job);
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Get(':jobId')
  async get(@Param('jobId') jobId: string) {
    const job = await this.importJobs.getByCodeOrId(jobId);
    return this.importJobs.toView(job);
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @ApiBearerAuth()
  @Post(':jobId/retry')
  async retry(@Param('jobId') jobId: string) {
    const job = await this.importJobs.retry(jobId);
    return this.importJobs.toView(job);
  }
}

@ApiTags('health')
@Controller('health')
export class ConnectorHealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('auth')
  async auth() {
    const issuer = this.config.get<string>('KEYCLOAK_ISSUER');
    const jwks = this.config.get<string>('KEYCLOAK_JWKS_URL');
    let keycloakReachable = false;
    if (jwks) {
      try {
        const res = await fetch(jwks, { method: 'GET' });
        keycloakReachable = res.ok;
      } catch {
        keycloakReachable = false;
      }
    }
    return {
      status: keycloakReachable ? 'ok' : 'degraded',
      keycloakEnabled: this.config.get<string>('KEYCLOAK_ENABLED') === 'true',
      keycloakIssuer: issuer || null,
      keycloakReachable,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('database')
  async database() {
    try {
      await this.db.dataSource.query('SELECT 1');
      return { status: 'ok', databaseReachable: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: 'error',
        databaseReachable: false,
        errorCode: 'DATABASE_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Public()
  @Get('storage')
  async storage() {
    const root = this.config.get<string>('STORAGE_ROOT')
      || this.config.get<string>('REPO_STORAGE_ROOT')
      || '';
    try {
      if (root) {
        const fs = await import('node:fs/promises');
        await fs.access(root);
      }
      return { status: 'ok', storageReachable: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: 'error',
        storageReachable: false,
        errorCode: 'STORAGE_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Public()
  @Get('import-worker')
  async importWorker() {
    const queued = await this.db.connectorImportJobs.count({
      where: { status: ConnectorImportJobStatus.QUEUED },
    });
    const processing = await this.db.connectorImportJobs.count({
      where: { status: ConnectorImportJobStatus.PROCESSING },
    });
    return {
      status: 'ok',
      worker: 'in-process',
      queued,
      processing,
      note: 'MCP imports process via setImmediate background tasks in repo-api',
      timestamp: new Date().toISOString(),
    };
  }
}

/** Helper kept for tests / callers that only have a raw Bearer. */
export function deriveSessionIdFromBearer(raw: string): string | null {
  const trimmed = raw.trim().replace(/^Bearer\s+/i, '');
  if (trimmed.startsWith('mcp_')) return sessionIdFromApiKey(trimmed);
  return sessionIdFromAccessToken(trimmed);
}

export function bearerExpiryIso(raw: string): string | null {
  const trimmed = raw.trim().replace(/^Bearer\s+/i, '');
  if (trimmed.startsWith('mcp_')) return null;
  const ms = accessTokenExpiresAtMs(trimmed);
  return ms ? new Date(ms).toISOString() : null;
}
