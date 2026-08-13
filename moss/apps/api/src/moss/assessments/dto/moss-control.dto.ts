import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateMossControlAssessmentDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  assessorScore?: number | null;

  @IsOptional() @IsString() @MaxLength(8000) scoreRationale?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) comment?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) findingText?: string | null;

  @IsOptional()
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'SCORED', 'NEEDS_EVIDENCE', 'COMPLETE'])
  status?: string;
}
