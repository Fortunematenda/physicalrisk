import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../common/audit.service';
import { McpIntegration, McpIntegrationStatus } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { CreateMcpIntegrationDto, MCP_TOOL_NAMES, McpToolName, mcpAllowsAllProjects, normalizeMcpAllowedProjectIds } from './mcp.dto';

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
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
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

  async validateApiKey(rawKey: string): Promise<McpIntegration> {
    const trimmed = rawKey.trim();
    if (!trimmed.startsWith(API_KEY_PREFIX)) {
      throw new Error('invalid prefix');
    }
    const prefix = trimmed.slice(0, 12);
    const candidates = await this.db.mcpIntegrations.find({
      where: { apiKeyPrefix: prefix, status: McpIntegrationStatus.ACTIVE },
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

  assertProjectAllowed(integration: McpIntegration, projectId: string): void {
    const allowed = integration.allowedProjectIds ?? [];
    if (mcpAllowsAllProjects(allowed)) return;
    if (!allowed.includes(projectId)) {
      throw new Error(`project ${projectId} not allowed`);
    }
  }

  assertToolAllowed(integration: McpIntegration, toolName: McpToolName): void {
    // Always available helpers for ChatGPT Actions name→ID mapping and chunked uploads.
    if (
      toolName === 'resolve_import_targets'
      || toolName === 'prepare_approved_document'
      || toolName === 'begin_document_upload'
      || toolName === 'upload_document_chunk'
    ) {
      return;
    }

    const allowed = integration.allowedTools?.length ? integration.allowedTools : [...MCP_TOOL_NAMES];
    if (!allowed.includes(toolName)) {
      throw new Error(`tool ${toolName} not allowed`);
    }
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
