import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMossAssessmentDto {
  @IsString() organisationId!: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
}

export class UpdateMossAssessmentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() siteId?: string | null;
}
