import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from './moss-assessments.service';
import { CreateMossAssessmentDto, UpdateMossAssessmentDto } from './dto/moss-assessment.dto';
import { UpdateMossControlAssessmentDto } from './dto/moss-control.dto';
import { MossScoringService } from '../scoring/moss-scoring.service';
import { MossResultsService } from '../results/moss-results.service';
import { MossFindingsService } from '../findings/moss-findings.service';
import { MossRecommendationsService } from '../recommendations/moss-recommendations.service';
import { MossEvidenceService } from '../evidence/moss-evidence.service';
import { MossCatalogueService } from '../catalogue/moss-catalogue.service';
import { MossReportsService } from '../reports/moss-reports.service';

export class SubmitMossAssessmentDto {
  @IsOptional() @IsBoolean() confirmIncomplete?: boolean;
}

export class MossReviewNoteDto {
  @IsOptional() @IsString() note?: string;
}

export class MossReturnDto {
  @IsString() @MinLength(3) comment!: string;
}

export class CloneMossCatalogueDto {
  @IsString() @MinLength(1) version!: string;
  @IsOptional() @IsString() title?: string;
}

export class UpdateMossCatalogueDomainDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateMossCatalogueControlDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() controlFunction?: string | null;
  @IsOptional() @IsString() owner?: string | null;
  @IsOptional() @IsString() frequency?: string | null;
  @IsOptional() @IsString() metric?: string | null;
  @IsOptional() @IsString() thresholdText?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

@Controller('moss')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MossAssessmentsController {
  constructor(
    private readonly assessments: MossAssessmentsService,
    private readonly scoring: MossScoringService,
    private readonly results: MossResultsService,
    private readonly findings: MossFindingsService,
    private readonly recommendations: MossRecommendationsService,
    private readonly evidence: MossEvidenceService,
    private readonly catalogue: MossCatalogueService,
    private readonly reports: MossReportsService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.assessments.dashboard(user);
  }

  @Get('admin/catalogue')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  async adminCatalogue(@Query('versionId') versionId?: string) {
    const { versions } = await this.catalogue.listVersions();
    const selectedId =
      versionId ||
      versions.find((v) => v.status === 'PUBLISHED')?.id ||
      versions.find((v) => v.status === 'DRAFT')?.id ||
      versions[0]?.id;
    if (!selectedId) {
      return {
        versions,
        domains: [],
        controlRows: [],
        readOnly: true,
        editable: false,
        note: 'No catalogue versions found. Import the Master Catalogue first.',
      };
    }
    const workspace = await this.catalogue.getVersionWorkspace(selectedId);
    return { ...workspace, versions };
  }

  @Get('admin/catalogue/versions')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  adminCatalogueVersions() {
    return this.catalogue.listVersions();
  }

  @Get('admin/catalogue/versions/:id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  adminCatalogueVersion(@Param('id') id: string) {
    return this.catalogue.getVersionWorkspace(id);
  }

  @Post('admin/catalogue/versions/:id/clone')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  cloneCatalogue(
    @Param('id') id: string,
    @Body() body: CloneMossCatalogueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogue.cloneVersion(id, body, user);
  }

  @Post('admin/catalogue/versions/:id/publish')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  publishCatalogue(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalogue.publishVersion(id, user);
  }

  @Patch('admin/catalogue/domains/:domainId')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  updateCatalogueDomain(
    @Param('domainId') domainId: string,
    @Body() body: UpdateMossCatalogueDomainDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogue.updateDomain(domainId, body, user);
  }

  @Patch('admin/catalogue/controls/:controlId')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  updateCatalogueControl(
    @Param('controlId') controlId: string,
    @Body() body: UpdateMossCatalogueControlDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogue.updateControl(controlId, body, user);
  }

  @Get('admin/scoring')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  adminScoring() {
    return this.scoring.adminSummary();
  }

  @Get('assessments')
  list(@CurrentUser() user: AuthUser) {
    return this.assessments.list(user);
  }

  @Post('assessments')
  create(@Body() body: CreateMossAssessmentDto, @CurrentUser() user: AuthUser) {
    return this.assessments.create(body, user);
  }

  @Patch('assessments/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMossAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.update(id, body, user);
  }

  @Delete('assessments/:id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.remove(id, user);
  }

  @Get('assessments/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.getWorkspace(id, user);
  }

  @Post('assessments/:id/submit')
  submit(
    @Param('id') id: string,
    @Body() body: SubmitMossAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.submit(id, user, { confirmIncomplete: body?.confirmIncomplete });
  }

  @Post('assessments/:id/mark-reviewed')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  markReviewed(
    @Param('id') id: string,
    @Body() body: MossReviewNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.markReviewed(id, user, body?.note);
  }

  @Post('assessments/:id/approve')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.approve(id, user);
  }

  @Post('assessments/:id/return')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  returnToClient(
    @Param('id') id: string,
    @Body() body: MossReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.returnToClient(id, body.comment, user);
  }

  @Post('assessments/:id/evaluate')
  evaluate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.scoring.evaluate(id, user);
  }

  @Get('assessments/:id/results')
  resultsEndpoint(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.results.getResults(id, user);
  }

  @Post('assessments/:id/reports/generate')
  generateReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.generate(id, user);
  }

  @Get('assessments/:id/reports')
  listReports(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.listForAssessment(id, user);
  }

  @Get('reports/:reportId')
  getReport(@Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.get(reportId, user);
  }

  @Get('reports/:reportId/content')
  getReportContent(@Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.getContent(reportId, user);
  }

  @Get('reports/:reportId/file')
  async downloadReportFile(
    @Param('reportId') reportId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const file = await this.reports.downloadFile(reportId, user);
    const body = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    res.status(200);
    res.setHeader('Content-Type', file.mimeType || 'application/pdf');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    res.end(body);
  }

  @Get('assessments/:id/findings')
  listFindings(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.findings.list(id, user);
  }

  @Post('assessments/:id/findings')
  createFinding(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.findings.create(id, body, user);
  }

  @Patch('assessments/:id/findings/:findingId')
  updateFinding(
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.findings.update(id, findingId, body, user);
  }

  @Delete('assessments/:id/findings/:findingId')
  removeFinding(
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.findings.remove(id, findingId, user);
  }

  @Get('assessments/:id/recommendations')
  listRecommendations(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recommendations.list(id, user);
  }

  @Post('assessments/:id/recommendations')
  createRecommendation(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.recommendations.create(id, body, user);
  }

  @Patch('assessments/:id/recommendations/:recommendationId')
  updateRecommendation(
    @Param('id') id: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.recommendations.update(id, recommendationId, body, user);
  }

  @Delete('assessments/:id/recommendations/:recommendationId')
  removeRecommendation(
    @Param('id') id: string,
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.recommendations.remove(id, recommendationId, user);
  }

  @Get('assessments/:assessmentId/controls/:controlCode/evidence')
  listEvidence(
    @Param('assessmentId') assessmentId: string,
    @Param('controlCode') controlCode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evidence.list(assessmentId, controlCode, user);
  }

  @Post('assessments/:assessmentId/controls/:controlCode/evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadEvidence(
    @Param('assessmentId') assessmentId: string,
    @Param('controlCode') controlCode: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; description?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.evidence.upload(assessmentId, controlCode, file, user, body);
  }

  @Get('assessments/:assessmentId/controls/:controlCode/evidence/:evidenceId/download')
  downloadEvidence(
    @Param('assessmentId') assessmentId: string,
    @Param('controlCode') controlCode: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evidence.downloadUrl(assessmentId, controlCode, evidenceId, user);
  }

  @Get('assessments/:id/domains/:domainCode')
  getDomain(
    @Param('id') id: string,
    @Param('domainCode') domainCode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.getDomainWorkspace(id, domainCode, user);
  }

  @Get('assessments/:id/controls/:controlCode')
  getControl(
    @Param('id') id: string,
    @Param('controlCode') controlCode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.getControlState(id, controlCode, user);
  }

  @Patch('assessments/:id/controls/:controlCode')
  saveControl(
    @Param('id') id: string,
    @Param('controlCode') controlCode: string,
    @Body() body: UpdateMossControlAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.saveControl(id, controlCode, body, user);
  }
}
