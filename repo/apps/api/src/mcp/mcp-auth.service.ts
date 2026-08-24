import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';
import * as http from 'http';
import * as https from 'https';
import { AuditService } from '../common/audit.service';
import { McpIntegration, McpIntegrationStatus, User, UserRole } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { SsoUserSyncService } from '../users/sso-user-sync.service';
import {
  CreateMcpIntegrationDto,
  MCP_ALL_PROJECTS_SCOPE,
  MCP_TOOL_NAMES,
  McpToolName,
  mcpAllowsAllProjects,
  normalizeMcpAllowedProjectIds,
} from './mcp.dto';
import { McpForbiddenException, McpToolException } from './mcp.exceptions';

/** Tools added after many ChatGPT integrations were created with a frozen allow-list. */
const WORKSPACE_TOOLS = new Set<McpToolName>([
  'create_workspace',
  'get_workspace',
  'find_workspaces',
  'get_latest_pending_workspace',
  'resume_workspace',
  'list_workspace_documents',
  'get_workspace_summary',
  'validate_workspace',
  'submit_workspace',
  'attach_document_to_workspace',
  'search_documents',
  'get_document',
]);

const API_KEY_PREFIX = 'mcp_';

export interface McpIntegrationView {
  id: string;
  name: string;
  status: McpIntegrationStatus;
  apiKeyPrefix: string;
  allowedProjectIds: string[];
  allowedTools: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  rotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedMcpIntegration extends McpIntegrationView {
  apiKey: string;
}

@Injectable()
export class McpAuthService {
  private readonly logger = new Logger(McpAuthService.name);
  private jwksCache: { keys: any[]; expiresAt: number } | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly ssoUsers: SsoUserSyncService,
  ) {}

  listIntegrations(): Promise<McpIntegration[]> {
    return this.db.mcpIntegrations.find({ order: { createdAt: 'DESC' } });
  }

  toView(integration: McpIntegration): McpIntegrationView {
    return {
      id: integration.id,
      name: integration.name,
      status: integration.status,
      apiKeyPrefix: integration.apiKeyPrefix,
      allowedProjectIds: integration.allowedProjectIds ?? [],
      allowedTools: integration.allowedTools ?? [],
      expiresAt: integration.expiresAt,
      lastUsedAt: integration.lastUsedAt,
      rotatedAt: integration.rotatedAt,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  async createIntegration(
    input: CreateMcpIntegrationDto,
    userId?: string,
  ): Promise<CreatedMcpIntegration> {
    const allowedProjectIds = this.requireNormalizedProjectScope(input.allowedProjectIds);
    const { raw, hash, prefix } = this.generateApiKey();
    const createdBy = userId ? await this.db.users.findOne({ where: { id: userId } }) : null;
    const integration = this.db.mcpIntegrations.create({
      name: input.name.trim(),
      status: McpIntegrationStatus.ACTIVE,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      allowedProjectIds,
      allowedTools: input.allowedTools?.length ? input.allowedTools : [...MCP_TOOL_NAMES],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      lastUsedAt: null,
      createdBy,
      rotatedAt: null,
    });
    const saved = await this.db.mcpIntegrations.save(integration);
    await this.audit.record({
      userId,
      action: 'CREATE',
      entityType: 'McpIntegration',
      entityId: saved.id,
      message: `Created MCP integration ${saved.name}`,
      after: this.toView(saved),
    });
    return { ...this.toView(saved), apiKey: raw };
  }

  async updateAllowedProjects(
    id: string,
    allowedProjectIds: string[],
    userId?: string,
  ): Promise<McpIntegrationView> {
    const integration = await this.requireIntegration(id);
    const before = this.toView(integration);
    integration.allowedProjectIds = this.requireNormalizedProjectScope(allowedProjectIds);
    const saved = await this.db.mcpIntegrations.save(integration);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entityType: 'McpIntegration',
      entityId: saved.id,
      message: `Updated MCP project scope for ${saved.name}`,
      before,
      after: this.toView(saved),
    });
    return this.toView(saved);
  }

  async updateIntegration(
    id: string,
    input: {
      name?: string;
      allowedProjectIds?: string[];
      allowedTools?: McpToolName[];
      status?: 'ACTIVE' | 'DISABLED';
    },
    userId?: string,
  ): Promise<McpIntegrationView> {
    const integration = await this.requireIntegration(id);
    const before = this.toView(integration);
    if (typeof input.name === 'string' && input.name.trim()) {
      integration.name = input.name.trim();
    }
    if (input.allowedProjectIds) {
      integration.allowedProjectIds = this.requireNormalizedProjectScope(input.allowedProjectIds);
    }
    if (input.allowedTools) {
      if (!input.allowedTools.length) {
        throw new BadRequestException('Select at least one tool');
      }
      integration.allowedTools = input.allowedTools;
    }
    if (input.status === 'ACTIVE' || input.status === 'DISABLED') {
      integration.status = input.status as McpIntegrationStatus;
    }
    const saved = await this.db.mcpIntegrations.save(integration);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entityType: 'McpIntegration',
      entityId: saved.id,
      message: `Updated MCP integration ${saved.name}`,
      before,
      after: this.toView(saved),
    });
    return this.toView(saved);
  }

  async rotateIntegration(id: string, userId?: string): Promise<CreatedMcpIntegration> {
    const integration = await this.requireIntegration(id);
    const { raw, hash, prefix } = this.generateApiKey();
    integration.apiKeyHash = hash;
    integration.apiKeyPrefix = prefix;
    integration.rotatedAt = new Date();
    const saved = await this.db.mcpIntegrations.save(integration);
    await this.audit.record({
      userId,
      action: 'MCP_CREDENTIAL_ROTATED',
      entityType: 'McpIntegration',
      entityId: saved.id,
      message: `Rotated MCP API key for ${saved.name}`,
      after: { apiKeyPrefix: saved.apiKeyPrefix, rotatedAt: saved.rotatedAt },
    });
    return { ...this.toView(saved), apiKey: raw };
  }

  async disableIntegration(id: string, userId?: string): Promise<McpIntegrationView> {
    const integration = await this.requireIntegration(id);
    integration.status = McpIntegrationStatus.DISABLED;
    const saved = await this.db.mcpIntegrations.save(integration);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entityType: 'McpIntegration',
      entityId: saved.id,
      message: `Disabled MCP integration ${saved.name}`,
      after: { status: saved.status },
    });
    return this.toView(saved);
  }

  async deleteIntegration(id: string, userId?: string): Promise<{ deleted: true; id: string }> {
    const integration = await this.requireIntegration(id);
    const before = this.toView(integration);
    await this.db.mcpIntegrations.remove(integration);
    await this.audit.record({
      userId,
      action: 'DELETE',
      entityType: 'McpIntegration',
      entityId: id,
      message: `Deleted MCP integration ${before.name}`,
      before,
    });
    return { deleted: true, id };
  }

  /**
   * Accept either a classic `mcp_…` API key (Custom GPT Actions) or a Keycloak
   * user access token (Notion-style ChatGPT connector / repo-mcp OAuth).
   */
  async validateBearer(rawBearer: string): Promise<McpIntegration> {
    const trimmed = rawBearer.trim();
    if (trimmed.startsWith(API_KEY_PREFIX)) {
      return this.validateApiKey(trimmed);
    }
    return this.validateUserAccessToken(trimmed);
  }

  async validateApiKey(rawKey: string): Promise<McpIntegration> {
    const trimmed = rawKey.trim();
    if (!trimmed.startsWith(API_KEY_PREFIX)) {
      throw new Error('invalid prefix');
    }
    const prefix = trimmed.slice(0, 12);
    const candidates = await this.db.mcpIntegrations.find({
      where: { apiKeyPrefix: prefix, status: McpIntegrationStatus.ACTIVE },
      relations: { createdBy: true },
    });
    const hash = this.hashApiKey(trimmed);
    const match = candidates.find((item) => item.apiKeyHash === hash);
    if (!match) throw new Error('not found');
    if (match.expiresAt && match.expiresAt.getTime() < Date.now()) {
      throw new Error('expired');
    }
    match.lastUsedAt = new Date();
    await this.db.mcpIntegrations.save(match);
    return match;
  }

  /** Build an in-memory MCP integration for a signed-in SSO user (all projects + tools). */
  async validateUserAccessToken(token: string): Promise<McpIntegration> {
    if (this.config.get<string>('KEYCLOAK_ENABLED') !== 'true') {
      throw new Error('keycloak disabled');
    }
    const payload = await this.verifyKeycloakToken(token);
    const realmRoles: string[] = payload.realm_roles ?? payload.realm_access?.roles ?? [];
    const repoRole = this.mapKeycloakRoleToRepo(realmRoles);
    const name =
      (typeof payload.name === 'string' && payload.name.trim())
      || [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim()
      || (typeof payload.preferred_username === 'string' && payload.preferred_username.trim())
      || undefined;
    const email = typeof payload.email === 'string' ? payload.email : '';
    const local = await this.ssoUsers.sync({ email, name, role: repoRole });
    if (!local?.id) throw new Error('sso user sync failed');

    return this.syntheticSsoIntegration(local);
  }

  private syntheticSsoIntegration(user: User): McpIntegration {
    const now = new Date();
    return {
      id: `sso:${user.id}`,
      name: `ChatGPT SSO (${user.email})`,
      status: McpIntegrationStatus.ACTIVE,
      apiKeyHash: '',
      apiKeyPrefix: 'sso_',
      allowedProjectIds: [MCP_ALL_PROJECTS_SCOPE],
      allowedTools: [...MCP_TOOL_NAMES],
      expiresAt: null,
      lastUsedAt: now,
      createdBy: user,
      rotatedAt: null,
      createdAt: now,
      updatedAt: now,
    } as McpIntegration;
  }

  /**
   * Browser upload tokens store integrationId from prepare_approved_document.
   * @Repo OAuth uses synthetic ids (sso:<userId>) — never query those as UUIDs.
   */
  async resolveIntegrationForBrowserUpload(integrationId: string): Promise<McpIntegration> {
    if (integrationId.startsWith('sso:')) {
      const userId = integrationId.slice(4).trim();
      if (!userId) {
        throw new BadRequestException('Upload link SSO owner id is missing');
      }
      const user = await this.db.users.findOne({ where: { id: userId } });
      if (!user) {
        throw new BadRequestException('Upload link owner user was not found — reconnect @Repo and create a new upload link');
      }
      return this.syntheticSsoIntegration(user);
    }

    const integration = await this.db.mcpIntegrations.findOne({
      where: { id: integrationId },
      relations: { createdBy: true },
    });
    if (!integration || integration.status !== McpIntegrationStatus.ACTIVE) {
      throw new BadRequestException('MCP integration for this upload link is not active');
    }
    return integration;
  }

  private mapKeycloakRoleToRepo(realmRoles: string[]): string {
    if (realmRoles.includes('repo_admin')) return UserRole.ADMIN;
    if (realmRoles.includes('repo_importer')) return UserRole.IMPORTER;
    if (realmRoles.includes('repo_reviewer')) return UserRole.REVIEWER;
    return UserRole.VIEWER;
  }

  private async verifyKeycloakToken(token: string): Promise<any> {
    const jwksUrl = this.config.get<string>('KEYCLOAK_JWKS_URL');
    const issuer = this.config.get<string>('KEYCLOAK_ISSUER');
    if (!jwksUrl) throw new Error('KEYCLOAK_JWKS_URL not configured');

    const keys = await this.fetchJwks(jwksUrl);
    const signingKey = keys.find((k: any) => k.use === 'sig' && k.kty === 'RSA');
    if (!signingKey) throw new Error('No RSA signing key in JWKS');

    const pem = this.jwkToPem(signingKey);
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Cannot decode token');
    const [headerB64, payloadB64, signatureB64] = parts;
    const signatureBuffer = Buffer.from(
      padBase64(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      'base64',
    );
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(pem, signatureBuffer)) {
      throw new Error('Invalid token signature');
    }

    const payload = JSON.parse(Buffer.from(padBase64(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), 'base64').toString('utf8'));
    if (issuer && payload.iss !== issuer) throw new Error(`Issuer mismatch: ${payload.iss}`);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      const err = new Error('Token expired');
      (err as Error & { code?: string }).code = 'ACCESS_TOKEN_EXPIRED';
      throw err;
    }
    return payload;
  }

  private async fetchJwks(url: string): Promise<any[]> {
    if (this.jwksCache && Date.now() < this.jwksCache.expiresAt) {
      return this.jwksCache.keys;
    }
    return new Promise((resolve, reject) => {
      const fetcher = url.startsWith('https') ? https : http;
      fetcher.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const jwks = JSON.parse(data);
            this.jwksCache = { keys: jwks.keys, expiresAt: Date.now() + 300_000 };
            resolve(jwks.keys);
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private jwkToPem(jwk: any): string {
    if (jwk.x5c?.[0]) {
      const body = String(jwk.x5c[0]).match(/.{1,64}/g)?.join('\n') ?? jwk.x5c[0];
      return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
    }
    const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
    return keyObject.export({ type: 'spki', format: 'pem' }).toString();
  }

  assertProjectAllowed(integration: McpIntegration, projectId: string): void {
    const allowed = integration.allowedProjectIds ?? [];
    if (mcpAllowsAllProjects(allowed)) return;
    if (!allowed.includes(projectId)) {
      throw new McpForbiddenException(
        `Project ${projectId} is not allowed for this MCP integration`,
        'MCP_PROJECT_NOT_ALLOWED',
      );
    }
  }

  assertToolAllowed(integration: McpIntegration, toolName: McpToolName): void {
    // Always available: ChatGPT Actions binary-import path + helpers.
    // Older keys may omit these from allowedTools (UI shipped before FILE_PRESERVE).
    if (
      toolName === 'resolve_import_targets'
      || toolName === 'prepare_approved_document'
      || toolName === 'upload_original_docx'
      || toolName === 'upload_original_xlsx'
      || toolName === 'upload_original_pdf'
      || toolName === 'upload_original_pptx'
      || toolName === 'inspect_attachment_capability'
      || toolName === 'import_original_file'
      || toolName === 'prepare_original_file_import'
      || toolName === 'finalize_original_file_import'
      || toolName === 'prepare_automatic_file_import'
      || toolName === 'upload_original_file_chunk'
      || toolName === 'get_automatic_file_import_progress'
      || toolName === 'resume_automatic_file_import'
      || toolName === 'complete_automatic_file_import'
      || toolName === 'abort_automatic_file_import'
      || toolName === 'begin_document_upload'
      || toolName === 'upload_document_chunk'
      || toolName === 'submit_approved_file'
      || toolName === 'submit_approved_content'
      || toolName === 'search_documents'
      || toolName === 'get_document'
    ) {
      return;
    }

    const allowed = integration.allowedTools?.length ? integration.allowedTools : [...MCP_TOOL_NAMES];
    if (allowed.includes(toolName)) return;

    // Older GPT keys store an explicit allow-list from before workspaces shipped.
    // If they already have core repo access, grant the new workspace tools instead of HTTP 500.
    if (
      WORKSPACE_TOOLS.has(toolName)
      && (allowed.includes('list_repository_projects') || allowed.includes('submit_approved_document'))
    ) {
      return;
    }

    throw new McpToolException(toolName);
  }

  hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  private generateApiKey() {
    const secret = randomBytes(24).toString('base64url');
    const raw = `${API_KEY_PREFIX}${secret}`;
    return {
      raw,
      hash: this.hashApiKey(raw),
      prefix: raw.slice(0, 12),
    };
  }

  private async requireIntegration(id: string): Promise<McpIntegration> {
    const integration = await this.db.mcpIntegrations.findOne({ where: { id } });
    if (!integration) throw new NotFoundException('MCP integration not found');
    return integration;
  }

  private requireNormalizedProjectScope(ids: string[]): string[] {
    const normalized = normalizeMcpAllowedProjectIds(ids);
    if (!normalized.length) {
      throw new BadRequestException('Select at least one project, or All projects');
    }
    if (mcpAllowsAllProjects(normalized)) return normalized;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const id of normalized) {
      if (!uuid.test(id)) {
        throw new BadRequestException(`Invalid project id: ${id}`);
      }
    }
    return normalized;
  }
}

function padBase64(value: string): string {
  const mod = value.length % 4;
  if (mod === 0) return value;
  return value + '='.repeat(4 - mod);
}
