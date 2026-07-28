import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseFilters, UseGuards, UseInterceptors, ParseEnumPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ImportStatus, UserRole } from '../database/entities';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ImportsService } from './imports.service';
import { ImportExceptionFilter, ValidationExceptionFilter } from './import-exception.filter';
import { UploadImportDto, DraftImportDto } from './upload-import.dto';
import { RejectImportDto } from './reject-import.dto';
import { ClearQueueDto } from './clear-queue.dto';

const REVIEW_STATUSES = [
  ImportStatus.READY_FOR_REVIEW,
  ImportStatus.DUPLICATE_REVIEW,
  ImportStatus.VERSION_REVIEW,
] as const;

@ApiTags('imports')
@Controller('imports')
@UseFilters(ImportExceptionFilter, ValidationExceptionFilter)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(
    @Query('status', new ParseEnumPipe(ImportStatus, { optional: true })) status?: ImportStatus,
    @Query('review') review?: string,
  ) {
    if (review === 'true') {
      return this.imports.list(undefined, [...REVIEW_STATUSES]);
    }
    return this.imports.list(status);
  }

  @Post('clear-queue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  clearQueue(
    @Body() body: ClearQueueDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.imports.clearQueue(body.scope ?? 'all', user?.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.imports.get(id);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadImportDto,
    @CurrentUser() user: { id?: string; email?: string; name?: string } | null,
  ) {
    const approvedBy = body.approvedBy?.trim() || user?.name?.trim() || user?.email?.trim() || '';
    return this.imports.upload(file, { ...body, approvedBy }, user?.id, user?.email);
  }

  @Post('draft')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  saveDraft(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: DraftImportDto,
    @CurrentUser() user: { id?: string; email?: string; name?: string } | null,
  ) {
    return this.imports.saveDraft(file, body as any, user?.id, user?.email);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.imports.retry(id, user?.id);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.imports.dismiss(id, user?.id);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectImportDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.imports.reject(id, body.reason, user?.id);
  }
}
