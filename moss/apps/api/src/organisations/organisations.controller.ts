import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { OrganisationsService } from './organisations.service';

class OrganisationDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  primaryEmail?: string;
  @IsOptional() @IsString() primaryPhone?: string;
}

class UpdateOrganisationDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  primaryEmail?: string;
  @IsOptional() @IsString() primaryPhone?: string;
}

@Controller('organisations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganisationsController {
  constructor(private readonly service: OrganisationsService) {}

  @Get() list() {
    return this.service.list();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  create(@Body() body: OrganisationDto) {
    return this.service.create(body);
  }

  @Get(':id') get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateOrganisationDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
