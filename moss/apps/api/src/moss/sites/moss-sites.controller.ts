import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { MossSitesService } from './moss-sites.service';
import { UpdateSiteDto } from './dto/site.dto';

/**
 * Site CRUD for MOSS.
 * Organisation-scoped list/create remain on OrganisationsController
 * (GET/POST /organisations/:id/sites) and delegate here to avoid duplicate routes.
 */
@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MossSitesController {
  constructor(private readonly sites: MossSitesService) {}

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sites.get(id, user);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  update(@Param('id') id: string, @Body() body: UpdateSiteDto, @CurrentUser() user: AuthUser) {
    return this.sites.update(id, body, user);
  }
}
