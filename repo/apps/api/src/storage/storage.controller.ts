import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VpsStorageService } from './vps-storage.service';

@ApiTags('vps-storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: VpsStorageService) {}

  @Get('health') health() { return this.storage.health(); }
  @Get('projects/:projectId/tree') tree(@Param('projectId') projectId: string) { return this.storage.tree(projectId); }
  @Post('projects/:projectId/sync') sync(@Param('projectId') projectId: string) { return this.storage.ensureProjectStructure(projectId); }
}
