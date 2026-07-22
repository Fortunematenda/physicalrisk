import { Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors, Body, UseFilters, ParseEnumPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ImportStatus } from '../database/entities';
import { CurrentUser } from '../common/current-user.decorator';
import { ImportsService } from './imports.service';
import { ImportExceptionFilter, ValidationExceptionFilter } from './import-exception.filter';
import { UploadImportDto, DraftImportDto } from './upload-import.dto';

@ApiTags('imports')
@Controller('imports')
@UseFilters(ImportExceptionFilter, ValidationExceptionFilter)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get() list(@Query('status', new ParseEnumPipe(ImportStatus, { optional: true })) status?: ImportStatus) { return this.imports.list(status); }
  @Get(':id') get(@Param('id') id: string) { return this.imports.get(id); }

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

  @Post(':id/retry') retry(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) { return this.imports.retry(id, user?.id); }
  @Post(':id/dismiss') dismiss(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) { return this.imports.dismiss(id, user?.id); }
}
