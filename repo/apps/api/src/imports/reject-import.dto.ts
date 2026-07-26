import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectImportDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
