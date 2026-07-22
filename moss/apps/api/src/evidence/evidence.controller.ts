import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EvidenceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { EvidenceService } from './evidence.service';

class EvidenceUploadDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() questionCode?: string;
  @IsOptional() @IsString() questionId?: string;
  @IsOptional() @IsString() inputDefinitionId?: string;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() evidencePeriod?: string;
  @IsOptional() @IsString() evidenceSource?: string;
}

class EvidenceReviewDto {
  @IsEnum(EvidenceStatus) status!: EvidenceStatus;
  @IsOptional() @IsString() reviewerNote?: string;
  @IsOptional() @IsString() findingId?: string;
}

@Controller('evidence')
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(private readonly service: EvidenceService) {}

  @Post('assessment/:assessmentId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(
    @Param('assessmentId') assessmentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: EvidenceUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upload(assessmentId, file, body, user);
  }

  @Get('assessment/:assessmentId')
  list(@Param('assessmentId') assessmentId: string, @CurrentUser() user: AuthUser) {
    return this.service.list(assessmentId, user);
  }

  @Patch(':id/status')
  review(@Param('id') id: string, @Body() body: EvidenceReviewDto, @CurrentUser() user: AuthUser) {
    return this.service.updateStatus(id, body, user);
  }

  @Get(':id/download')
  download(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.downloadUrl(id, user);
  }
}
