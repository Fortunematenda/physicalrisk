import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(1) siteCode!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() region?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() status?: 'ACTIVE' | 'INACTIVE';
}
