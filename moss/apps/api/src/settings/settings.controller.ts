import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SettingsService } from './settings.service';

class UpdateSmtpDto {
  @IsOptional() @IsString() host?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;
  @IsOptional() @IsBoolean() secure?: boolean;
  @IsOptional() @IsIn(['SSL/TLS', 'STARTTLS']) encryption?: 'SSL/TLS' | 'STARTTLS';
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  fromEmail?: string;
  @IsOptional() @IsString() fromName?: string;
}

class TestSmtpDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  to?: string;
}

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('summary')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  summary() {
    return this.settings.summary();
  }

  @Patch('smtp')
  @Roles('SUPER_ADMIN')
  updateSmtp(@Body() body: UpdateSmtpDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateSmtp(body, user);
  }

  @Post('smtp/test')
  @Roles('SUPER_ADMIN')
  testSmtp(@Body() body: TestSmtpDto, @CurrentUser() user: AuthUser) {
    return this.settings.testSmtp(body?.to, user);
  }
}
