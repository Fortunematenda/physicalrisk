import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UploadImportDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Project is required' })
  projectId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Source system is required' })
  sourceSystemId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Document Title is required' })
  title!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  documentCode?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Document Type is required' })
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
  @IsNotEmpty({ message: 'Version is required' })
  versionNo!: string;

  // Optional in the payload — controller fills from the authenticated SSO user when blank.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  approvedBy?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Approval Date is required' })
  approvalDate!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  sectionKey?: string;

  @IsOptional()
  metadataJson?: string;

  @IsOptional()
  relationshipsJson?: string;

  @IsOptional()
  @IsIn(['NEW', 'NEW_VERSION'])
  mode?: 'NEW' | 'NEW_VERSION';

  @IsOptional()
  @Transform(trimString)
  @IsString()
  existingDocumentId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  draftJobId?: string;
}

export class DraftImportDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Select a project before saving a draft' })
  projectId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Select a source system before saving a draft' })
  sourceSystemId!: string;

  @IsOptional() @Transform(trimString) @IsString() title?: string;
  @IsOptional() @Transform(trimString) @IsString() documentCode?: string;
  @IsOptional() @Transform(trimString) @IsString() documentType?: string;
  @IsOptional() @Transform(trimString) @IsString() description?: string;
  @IsOptional() @Transform(trimString) @IsString() owner?: string;
  @IsOptional() @Transform(trimString) @IsString() versionNo?: string;
  @IsOptional() @Transform(trimString) @IsString() approvedBy?: string;
  @IsOptional() @Transform(trimString) @IsString() approvalDate?: string;
  @IsOptional() @Transform(trimString) @IsString() approvalStatus?: string;
  @IsOptional() @Transform(trimString) @IsString() sectionKey?: string;
  @IsOptional() metadataJson?: string;
  @IsOptional() relationshipsJson?: string;
  @IsOptional() @IsIn(['NEW', 'NEW_VERSION']) mode?: 'NEW' | 'NEW_VERSION';
  @IsOptional() @Transform(trimString) @IsString() existingDocumentId?: string;
  @IsOptional() @Transform(trimString) @IsString() draftJobId?: string;
}
