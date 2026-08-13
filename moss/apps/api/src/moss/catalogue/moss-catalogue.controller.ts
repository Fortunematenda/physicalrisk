import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { MossCatalogueService } from './moss-catalogue.service';

@Controller('moss/catalogue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MossCatalogueController {
  constructor(private readonly catalogue: MossCatalogueService) {}

  @Get()
  summary() {
    return this.catalogue.summary();
  }

  @Get('domains')
  listDomains() {
    return this.catalogue.listDomains();
  }

  @Get('domains/:domainCode')
  getDomain(@Param('domainCode') domainCode: string) {
    return this.catalogue.getDomain(domainCode);
  }

  @Get('controls/:controlCode')
  getControl(@Param('controlCode') controlCode: string) {
    return this.catalogue.getControl(controlCode);
  }
}
