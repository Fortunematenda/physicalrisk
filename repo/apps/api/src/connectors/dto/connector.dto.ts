import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { FolderImportMode, SyncSchedule } from '../../database/entities';

export class GoogleDriveConnectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  defaultProjectId?: string;

  @IsOptional()
  @IsUUID()
  defaultSectionId?: string;

  @IsOptional()
  @IsUUID()
  sourceSystemId?: string;
}

export class SelectRootFolderDto {
  @IsString()
  folderId!: string;

  @IsString()
  folderName!: string;
}

export class CreateFolderMappingDto {
  @IsString()
  externalFolderId!: string;

  @IsString()
  externalFolderName!: string;

  @IsOptional()
  @IsString()
  externalFolderPath?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsEnum(FolderImportMode)
  importMode?: FolderImportMode;

  @IsOptional()
  @IsBoolean()
  requireManualReview?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultDocumentType?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateFolderMappingDto {
  @IsOptional()
  @IsString()
  externalFolderName?: string;

  @IsOptional()
  @IsString()
  externalFolderPath?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsEnum(FolderImportMode)
  importMode?: FolderImportMode;

  @IsOptional()
  @IsBoolean()
  requireManualReview?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultDocumentType?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ImportSelectedDto {
  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];

  @IsOptional()
  @IsString()
  folderId?: string;
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(SyncSchedule)
  syncSchedule?: SyncSchedule;

  @IsOptional()
  @IsUUID()
  defaultProjectId?: string;

  @IsOptional()
  @IsUUID()
  defaultSectionId?: string;

  @IsOptional()
  @IsUUID()
  sourceSystemId?: string;
}
