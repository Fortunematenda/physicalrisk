import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { OrganisationsService } from './organisations.service';
import { MossSitesService } from '../moss/sites/moss-sites.service';

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

class CreateIndustryDto {
  @IsString() @MinLength(2) name!: string;
}

class CreateSiteDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(1) siteCode!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() description?: string;
}

@Controller('organisations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganisationsController {
  constructor(
    private readonly service: OrganisationsService,
    private readonly sites: MossSitesService,
  ) {}

  @Get() list() {
    return this.service.list();
  }

  @Get('industries')
  listIndustries() {
    return this.service.listIndustries();
  }

  @Post('industries')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  addIndustry(@Body() body: CreateIndustryDto) {
    return this.service.addIndustry(body.name);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  create(@Body() body: OrganisationDto) {
    return this.service.create(body);
  }

  @Get(':id/sites')
  listSites(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sites.list(id, user);
  }

  @Post(':id/sites')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  createSite(@Param('id') id: string, @Body() body: CreateSiteDto, @CurrentUser() user: AuthUser) {
    return this.sites.create(id, body, user);
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
