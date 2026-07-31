import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UserRole, WorkspaceActivitySource, WorkspaceDocumentStatus, WorkspaceStatus, WorkspaceStep } from '../database/entities';
import { WorkspacesService } from './workspaces.service';

const MUTATE = [UserRole.ADMIN, UserRole.IMPORTER] as const;

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  create(
    @Body() body: { name: string; projectId: string },
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.workspaces.create({ ...body, source: WorkspaceActivitySource.WEB }, user);
  }

  @Get()
  list(
    @Query('workspaceCode') workspaceCode?: string,
    @Query('name') name?: string,
    @Query('projectCode') projectCode?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
    @Query('documentCode') documentCode?: string,
    @Query('importJobId') importJobId?: string,
    @CurrentUser() user?: { id?: string } | null,
  ) {
    return this.workspaces.list({
      workspaceCode,
      name,
      projectCode,
      status,
      mine: mine === 'true' || mine === '1',
      documentCode,
      importJobId,
    }, user);
  }

  @Get('search')
  search(@Query('q') q: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.search(q, user);
  }

  @Get('latest')
  latest(@CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.latest(user);
  }

  @Get('my/latest-pending')
  latestPending(@CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.latestPending(user);
  }

  @Get(':workspaceCode')
  get(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.get(workspaceCode, user);
  }

  @Patch(':workspaceCode')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  update(
    @Param('workspaceCode') workspaceCode: string,
    @Body() body: { name?: string; status?: WorkspaceStatus; currentStep?: WorkspaceStep },
    @CurrentUser() user?: { id?: string } | null,
  ) {
    return this.workspaces.update(workspaceCode, body, user);
  }

  @Post(':workspaceCode/pause')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  pause(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.pause(workspaceCode, user);
  }

  @Post(':workspaceCode/resume')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  resume(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.resume(workspaceCode, user);
  }

  @Post(':workspaceCode/validate')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  validate(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.validate(workspaceCode, user);
  }

  @Post(':workspaceCode/submit')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  submit(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.submit(workspaceCode, user);
  }

  @Post(':workspaceCode/cancel')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  cancel(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.cancel(workspaceCode, user);
  }

  @Post(':workspaceCode/archive')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  archive(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.archive(workspaceCode, user);
  }

  @Get(':workspaceCode/documents')
  documents(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.listDocuments(workspaceCode, user);
  }

  @Post(':workspaceCode/documents')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  addDocument(
    @Param('workspaceCode') workspaceCode: string,
    @Body() body: {
      fileName: string;
      originalFileName?: string;
      relativePath?: string;
      storageReference?: string;
      mimeType?: string;
      fileExtension?: string;
      checksum?: string;
      metadataJson?: Record<string, unknown>;
      importJobId?: string;
      status?: WorkspaceDocumentStatus;
    },
    @CurrentUser() user?: { id?: string } | null,
  ) {
    return this.workspaces.addDocument(workspaceCode, body, user);
  }

  @Patch(':workspaceCode/documents/:workspaceDocumentId')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  updateDocument(
    @Param('workspaceCode') workspaceCode: string,
    @Param('workspaceDocumentId') workspaceDocumentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user?: { id?: string } | null,
  ) {
    return this.workspaces.updateDocument(workspaceCode, workspaceDocumentId, body as never, user);
  }

  @Delete(':workspaceCode/documents/:workspaceDocumentId')
  @UseGuards(RolesGuard)
  @Roles(...MUTATE)
  removeDocument(
    @Param('workspaceCode') workspaceCode: string,
    @Param('workspaceDocumentId') workspaceDocumentId: string,
    @CurrentUser() user?: { id?: string } | null,
  ) {
    return this.workspaces.removeDocument(workspaceCode, workspaceDocumentId, user);
  }

  @Get(':workspaceCode/activity')
  activity(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.activity(workspaceCode, user);
  }

  @Get(':workspaceCode/summary')
  summary(@Param('workspaceCode') workspaceCode: string, @CurrentUser() user?: { id?: string } | null) {
    return this.workspaces.summary(workspaceCode, user);
  }
}
