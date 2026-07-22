import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, type UpdateSmtpInput } from '../email/email.service';
import type { AuthUser } from '../common/current-user.decorator';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async summary() {
    const [totalUsers, activeOrganisations, totalAssessments, activeUsers, email] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organisation.count(),
      this.prisma.assessmentSession.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.email.getSmtpPublicView(),
    ]);

    const nodeEnv = this.config.get<string>('NODE_ENV') || 'development';
    const s3Endpoint = this.config.get<string>('S3_ENDPOINT') || '';

    return {
      version: '1.1.0',
      environment: nodeEnv === 'production' ? 'Production' : nodeEnv === 'test' ? 'Test' : 'Development',
      database: 'PostgreSQL 16',
      fileStorage: s3Endpoint ? 'Object Storage (MinIO/S3)' : 'Local Storage',
      totalUsers,
      activeUsers,
      activeOrganisations,
      totalAssessments,
      lastBackupAt: null as string | null,
      lastBackupStatus: 'success' as const,
      app: {
        name: this.config.get<string>('APP_NAME') || 'MOSS',
        description: 'MOSS Gateway Repository for Physical Risk lean-revenue assessments.',
        url: this.config.get<string>('PUBLIC_URL') || this.config.get<string>('WEB_URL') || 'http://localhost:8081',
        email: email.fromEmail || 'no-reply@physicalrisk.local',
        timezone: this.config.get<string>('APP_TIMEZONE') || 'Africa/Johannesburg',
        currency: this.config.get<string>('APP_CURRENCY') || 'ZAR',
      },
      email,
      uploads: {
        maxFileSizeMb: Number(this.config.get<string>('UPLOAD_MAX_MB') || 25),
        allowedTypes: ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg'],
        virusScan: true,
        autoExtract: true,
        ocrProcessing: false,
      },
      assessmentDefaults: {
        defaultRiskRating: 'Moderate',
        defaultDueDays: 14,
        autoAssignId: true,
      },
    };
  }

  updateSmtp(body: UpdateSmtpInput, user: AuthUser) {
    return this.email.updateSmtp(body, user);
  }

  testSmtp(to: string | undefined, user: AuthUser) {
    return this.email.testSmtp(to || user.email, user);
  }
}
