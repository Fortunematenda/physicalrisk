import { Controller, Delete, Get, Param, Post, Put, Query, Body, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UserRole } from '../database/entities';
import { ConnectorsService } from './connectors.service';
import {
  CreateFolderMappingDto,
  GoogleDriveConnectDto,
  ImportSelectedDto,
  SelectRootFolderDto,
  UpdateConnectionDto,
  UpdateFolderMappingDto,
} from './dto/connector.dto';

const VIEW_ROLES = [UserRole.ADMIN, UserRole.IMPORTER] as const;
const MANAGE_ROLES = [UserRole.ADMIN] as const;

@ApiTags('connectors')
@Controller('connectors')
@UseGuards(RolesGuard)
export class ConnectorsController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  @Roles(...VIEW_ROLES)
  health() {
    return this.connectors.health();
  }

  @Get('providers')
  @Roles(...VIEW_ROLES)
  listProviders() {
    return this.connectors.listProviders();
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list() {
    return this.connectors.listConnections();
  }

  @Post('google-drive/connect')
  @Roles(...MANAGE_ROLES)
  connectGoogleDrive(
    @Body() body: GoogleDriveConnectDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.startGoogleDriveConnect(body, user?.id);
  }

  @Get('google-drive/callback')
  @Public()
  async googleDriveCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const webBase = (this.config.get<string>('CORS_ORIGIN') || 'http://localhost:8080').replace(/\/$/, '');
    if (!code || !state) {
      return res.redirect(`${webBase}/settings/source-connections?oauth=error&reason=missing_params`);
    }
    try {
      const result = await this.connectors.completeGoogleDriveCallback(code, state);
      return res.redirect(
        `${webBase}/settings/source-connections/${result.connectionId}?oauth=success`,
      );
    } catch {
      return res.redirect(`${webBase}/settings/source-connections?oauth=error&reason=callback_failed`);
    }
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id') id: string) {
    return this.connectors.getConnection(id);
  }

  @Put(':id')
  @Roles(...MANAGE_ROLES)
  update(
    @Param('id') id: string,
    @Body() body: UpdateConnectionDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.updateConnection(id, body, user?.id);
  }

  @Get(':id/folder-mappings')
  @Roles(...VIEW_ROLES)
  listFolderMappings(@Param('id') id: string) {
    return this.connectors.listFolderMappings(id);
  }
  @Post(':id/test')
  @Roles(...MANAGE_ROLES)
  test(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.connectors.testConnection(id, user?.id);
  }

  @Get(':id/folders')
  @Roles(...VIEW_ROLES)
  listFolders(@Param('id') id: string, @Query('parentFolderId') parentFolderId?: string) {
    return this.connectors.listFolders(id, parentFolderId);
  }

  @Get(':id/files')
  @Roles(...VIEW_ROLES)
  listFiles(
    @Param('id') id: string,
    @Query('folderId') folderId: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.connectors.listFiles(id, folderId, pageToken);
  }

  @Post(':id/select-root-folder')
  @Roles(...MANAGE_ROLES)
  selectRootFolder(
    @Param('id') id: string,
    @Body() body: SelectRootFolderDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.selectRootFolder(id, body, user?.id);
  }

  @Post(':id/folder-mappings')
  @Roles(...MANAGE_ROLES)
  createFolderMapping(
    @Param('id') id: string,
    @Body() body: CreateFolderMappingDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.createFolderMapping(id, body, user?.id);
  }

  @Put(':id/folder-mappings/:mappingId')
  @Roles(...MANAGE_ROLES)
  updateFolderMapping(
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
    @Body() body: UpdateFolderMappingDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.updateFolderMapping(id, mappingId, body, user?.id);
  }

  @Delete(':id/folder-mappings/:mappingId')
  @Roles(...MANAGE_ROLES)
  deleteFolderMapping(
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.deleteFolderMapping(id, mappingId, user?.id);
  }

  @Post(':id/sync')
  @Roles(...VIEW_ROLES)
  sync(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.connectors.syncConnection(id, user?.id);
  }

  @Post(':id/import-selected')
  @Roles(...VIEW_ROLES)
  importSelected(
    @Param('id') id: string,
    @Body() body: ImportSelectedDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.connectors.importSelected(id, body, user?.id);
  }

  @Get(':id/sync-runs')
  @Roles(...VIEW_ROLES)
  syncRuns(@Param('id') id: string) {
    return this.connectors.listSyncRuns(id);
  }

  @Delete(':id')
  @Roles(...MANAGE_ROLES)
  delete(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.connectors.deleteConnection(id, user?.id);
  }
}
