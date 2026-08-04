import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MCP_TOOL_NAMES = [
  'list_repository_projects',
  'list_repository_modules',
  'list_document_types',
  'resolve_import_targets',
  'check_document_exists',
  'prepare_approved_document',
  'begin_document_upload',
  'upload_document_chunk',
  'submit_approved_document',
  'get_import_status',
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
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Sentinel in allowedProjectIds: one API key may access every repository project (including future ones). */
export const MCP_ALL_PROJECTS_SCOPE = '*';

export function mcpAllowsAllProjects(allowedProjectIds?: string[] | null): boolean {
  return (allowedProjectIds ?? []).includes(MCP_ALL_PROJECTS_SCOPE);
}

export function normalizeMcpAllowedProjectIds(ids: string[]): string[] {
  const cleaned = [...new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (cleaned.includes(MCP_ALL_PROJECTS_SCOPE)) return [MCP_ALL_PROJECTS_SCOPE];
  return cleaned;
}

export class CreateMcpIntegrationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Project UUIDs, or ["*"] for every project in the repository. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedProjectIds!: string[];

  @IsOptional()
  @IsArray()
  @IsIn(MCP_TOOL_NAMES, { each: true })
  allowedTools?: McpToolName[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateMcpIntegrationProjectsDto {
  /** Project UUIDs, or ["*"] for every project in the repository. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedProjectIds!: string[];
}

export class UpdateMcpIntegrationDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** Project UUIDs, or ["*"] for every project in the repository. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedProjectIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MCP_TOOL_NAMES, { each: true })
  allowedTools?: McpToolName[];

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class McpJsonRpcRequestDto {
  @IsOptional()
  id?: string | number | null;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  method!: string;

  @IsOptional()
  params?: Record<string, unknown>;
}

export class CheckDocumentExistsDto {
  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  projectCode?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  title?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  fileName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  checksum?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentCode?: string;
}

export class SubmitApprovedDocumentDto {
  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  projectCode?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentCode?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  owner?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  versionNo!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  approvalStatus!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  approvedBy?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  approvalDate!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  sectionKey?: string;

  /** Human-readable module/section name — resolved to sectionKey server-side. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  module?: string;

  @IsOptional()
  metadataJson?: string;

  @IsOptional()
  relationshipsJson?: string;

  @IsOptional()
  @IsIn(['NEW', 'NEW_VERSION'])
  mode?: 'NEW' | 'NEW_VERSION';

  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  existingDocumentId?: string;

  @ValidateIf((o: SubmitApprovedDocumentDto) => !o.fileUrl?.trim() && !o.uploadId?.trim() && !o.documentContent?.trim())
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  /** Optional staged upload from begin_document_upload / upload_document_chunk. */
  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  uploadId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileContentBase64?: string;

  /** Public http(s) URL to the PDF. Repo downloads it server-side (ChatGPT-friendly). */
  @IsOptional()
  @Transform(trimString)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  fileUrl?: string;

  /**
   * Full document body generated in chat (Markdown/text).
   * ChatGPT same-chat path: research → generate → approve → submit with this field.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  documentContent?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  mimeType?: string;

  /** When set, successful import is attached to this workspace (WS-YYYY-#####). */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  workspaceCode?: string;

  /** Client-supplied idempotency key (also accepted via Idempotency-Key header). */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  idempotencyKey?: string;
}

export class ListRepositoryModulesDto {
  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  projectCode?: string;
}

export class ResolveImportTargetsDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  project!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  module?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentType?: string;
}

export class BeginDocumentUploadDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  totalChunks!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  mimeType?: string;
}

export class PrepareApprovedDocumentDto {
  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  projectCode?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentCode?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  owner?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  versionNo!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  approvalStatus!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  approvedBy?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  approvalDate!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  module?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  sectionKey?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  fileName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  mimeType?: string;

  /** When set, import is also attached to this Repository Workspace (WS-YYYY-#####). */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  workspaceCode?: string;

  @IsOptional()
  metadataJson?: string;

  @IsOptional()
  relationshipsJson?: string;

  @IsOptional()
  @IsIn(['NEW', 'NEW_VERSION'])
  mode?: 'NEW' | 'NEW_VERSION';

  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  existingDocumentId?: string;
}

export class AttachDocumentToWorkspaceDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  workspaceCode!: string;

  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  documentId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentCode?: string;

  @IsOptional()
  @Transform(trimString)
  @IsUUID('4')
  importJobId?: string;
}

export class UploadDocumentChunkDto {
  @Transform(trimString)
  @IsUUID('4')
  uploadId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  index!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  total!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  data!: string;
}

export class GetImportStatusDto {
  @Transform(trimString)
  @IsUUID('4')
  importJobId!: string;
}

export class McpToolCallDto {
  @ValidateNested()
  @Type(() => Object)
  @IsOptional()
  arguments?: Record<string, unknown>;
}
