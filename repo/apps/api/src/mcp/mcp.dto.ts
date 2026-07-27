import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MCP_TOOL_NAMES = [
  'list_repository_projects',
  'list_repository_modules',
  'list_document_types',
  'resolve_import_targets',
  'check_document_exists',
  'submit_approved_document',
  'get_import_status',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export class CreateMcpIntegrationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  allowedProjectIds!: string[];

  @IsOptional()
  @IsArray()
  @IsIn(MCP_TOOL_NAMES, { each: true })
  allowedTools?: McpToolName[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
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

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  approvedBy!: string;

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

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileContentBase64!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  mimeType?: string;
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
