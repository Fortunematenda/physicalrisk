import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { SystemRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsString() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEnum(SystemRole) systemRole!: SystemRole;
  @IsOptional() @IsArray() @IsString({ each: true }) organisationIds?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEnum(SystemRole) systemRole?: SystemRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) organisationIds?: string[];
}

class ResetPasswordDto {
  @IsString() @MinLength(8) password!: string;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user);
  }

  @Get('analysts')
  @Roles('SUPER_ADMIN', 'REVIEWER', 'ANALYST')
  analysts(@CurrentUser() user: AuthUser) {
    return this.users.analysts(user);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() body: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(body, user);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(id, body, user);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN')
  reset(@Param('id') id: string, @Body() body: ResetPasswordDto, @CurrentUser() user: AuthUser) {
    return this.users.resetPassword(id, body.password, user);
  }

  @Get(':id/audit')
  @Roles('SUPER_ADMIN')
  audit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.auditForUser(id, user);
  }
}
