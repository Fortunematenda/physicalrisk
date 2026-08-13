import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type MossCompletion = {
  assessed: number;
  total: number;
  percent: number;
};

export type MossProgressSnapshot = {
  overall: MossCompletion;
  domains: Array<{
    domainCode: string;
    name: string;
    sortOrder: number;
    assessed: number;
    total: number;
    percent: number;
  }>;
};

/** Completion-only progress. Never compute domain/overall maturity scores. */
@Injectable()
export class MossProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private percent(assessed: number, total: number) {
    if (!total) return 0;
    return Math.round((assessed / total) * 1000) / 10;
  }

  async forAssessment(assessmentId: string, catalogueVersionId: string): Promise<MossProgressSnapshot> {
    const [domains, scoredRows] = await Promise.all([
      this.prisma.mossDomain.findMany({
        where: { catalogueVersionId },
        orderBy: { sortOrder: 'asc' },
        include: { controls: { select: { id: true, controlCode: true } } },
      }),
      this.prisma.mossControlAssessment.findMany({
        where: {
          assessmentId,
          OR: [{ score: { not: null } }, { assessorScore: { not: null } }],
        },
        select: { mossControlId: true },
      }),
    ]);

    const scored = new Set(scoredRows.map((r) => r.mossControlId));
    const domainProgress = domains.map((d) => {
      const total = d.controls.length;
      const assessed = d.controls.filter((c) => scored.has(c.id)).length;
      return {
        domainCode: d.domainCode,
        name: d.name,
        sortOrder: d.sortOrder,
        assessed,
        total,
        percent: this.percent(assessed, total),
      };
    });

    const total = domainProgress.reduce((sum, d) => sum + d.total, 0);
    const assessed = domainProgress.reduce((sum, d) => sum + d.assessed, 0);
    return {
      overall: { assessed, total, percent: this.percent(assessed, total) },
      domains: domainProgress,
    };
  }
}
