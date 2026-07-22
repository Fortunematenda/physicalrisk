import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UserRole } from '../database/entities';
import { ConfigurationService } from './configuration.service';

const CONFIG_CREATE_ROLES = [UserRole.ADMIN, UserRole.IMPORTER] as const;

@ApiTags('configuration')
@Controller()
export class ConfigurationController {
  constructor(private readonly service: ConfigurationService) {}

  @Get('projects') listProjects() { return this.service.listProjects(); }
  @Get('projects/:id') getProject(@Param('id') id: string) { return this.service.getProject(id); }
  @Post('projects')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_CREATE_ROLES)
  createProject(@Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) {
    return this.service.createProject(body, user?.id);
  }
  @Patch('projects/:id') updateProject(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) { return this.service.updateProject(id, body, user?.id); }
  @Post('projects/:id/apply-template/:templateId') applyTemplate(@Param('id') id: string, @Param('templateId') templateId: string, @CurrentUser() user: { id?: string } | null) { return this.service.applyTemplate(id, templateId, user?.id); }
  @Post('projects/:id/sections')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_CREATE_ROLES)
  createProjectSection(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) {
    return this.service.createProjectSection(id, body, user?.id);
  }
  @Patch('project-sections/:id') updateProjectSection(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) { return this.service.updateProjectSection(id, body, user?.id); }
  @Delete('project-sections/:id') deleteProjectSection(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) { return this.service.deleteProjectSection(id, user?.id); }

  @Get('directory-templates') listTemplates() { return this.service.listTemplates(); }
  @Post('directory-templates') createTemplate(@Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) { return this.service.createTemplate(body, user?.id); }

  @Get('source-systems') listSources() { return this.service.listSources(); }
  @Post('source-systems')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_CREATE_ROLES)
  createSource(@Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) {
    return this.service.createSource(body, user?.id);
  }
  @Patch('source-systems/:id') updateSource(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateSource(id, body); }

  @Get('document-types') listDocumentTypes() { return this.service.listDocumentTypes(); }
  @Post('document-types')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_CREATE_ROLES)
  createDocumentType(@Body() body: Record<string, unknown>, @CurrentUser() user: { id?: string } | null) {
    return this.service.createDocumentType(body, user?.id);
  }
  @Patch('document-types/:id') updateDocumentType(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.updateDocumentType(id, body);
  }

  @Get('file-types') listFileTypes() { return this.service.listFileTypes(); }
  @Post('file-types') createFileType(@Body() body: Record<string, unknown>) { return this.service.createFileType(body); }
  @Patch('file-types/:id') updateFileType(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateFileType(id, body); }

  @Get('metadata-fields') listMetadataFields() { return this.service.listMetadataFields(); }
  @Post('metadata-fields') createMetadataField(@Body() body: Record<string, unknown>) { return this.service.createMetadataField(body); }
  @Patch('metadata-fields/:id') updateMetadataField(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateMetadataField(id, body); }

  @Get('routing-rules') listRoutingRules(@Query('projectId') projectId?: string) { return this.service.listRoutingRules(projectId); }
  @Post('routing-rules') createRoutingRule(@Body() body: Record<string, unknown>) { return this.service.createRoutingRule(body); }
  @Patch('routing-rules/:id') updateRoutingRule(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateRoutingRule(id, body); }

  @Get('settings') listSettings() { return this.service.listSettings(); }
  @Post('settings/:key') setSetting(@Param('key') key: string, @Body() body: { value: unknown; description?: string }) { return this.service.setSetting(key, body.value, body.description); }
}
