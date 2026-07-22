import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OptionInput = {
  id?: string;
  label: string;
  riskScore: number;
  sortOrder?: number;
};

type QuestionInput = {
  code: string;
  category: string;
  text: string;
  guidance?: string;
  evidenceHint?: string;
  weight: number;
  required?: boolean;
  sortOrder?: number;
  options?: OptionInput[];
};

type InputDefinitionInput = {
  code: string;
  label: string;
  guidance?: string;
  valueType: ValueType;
  unit?: string;
  required?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  defaultValue?: unknown;
};

@Injectable()
export class QuestionnairesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.questionnaire.findMany({
      include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  async getPublished(code: string) {
    const questionnaire = await this.getEditable(code);
    return questionnaire;
  }

  async getEditable(code: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { code },
      include: {
        versions: {
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          include: {
            inputDefinitions: { orderBy: { sortOrder: 'asc' } },
            questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
            assumptions: { orderBy: { label: 'asc' } },
          },
        },
      },
    });
    if (!questionnaire || !questionnaire.versions.length) {
      throw new NotFoundException('Questionnaire version not found.');
    }
    return questionnaire;
  }

  private async getVersionOrThrow(versionId: string) {
    const version = await this.prisma.questionnaireVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Questionnaire version not found.');
    return version;
  }

  private nextSortOrder(items: Array<{ sortOrder: number }>) {
    if (!items.length) return 1;
    return Math.max(...items.map((i) => i.sortOrder)) + 1;
  }

  async createInput(versionId: string, input: InputDefinitionInput) {
    await this.getVersionOrThrow(versionId);
    const code = input.code.trim().toUpperCase();
    const existing = await this.prisma.assessmentInputDefinition.findUnique({
      where: { questionnaireVersionId_code: { questionnaireVersionId: versionId, code } },
    });
    if (existing) throw new BadRequestException(`Calibration input ${code} already exists.`);

    const peers = await this.prisma.assessmentInputDefinition.findMany({
      where: { questionnaireVersionId: versionId },
      select: { sortOrder: true },
    });

    return this.prisma.assessmentInputDefinition.create({
      data: {
        questionnaireVersionId: versionId,
        code,
        label: input.label.trim(),
        guidance: input.guidance?.trim() || null,
        valueType: input.valueType,
        unit: input.unit?.trim() || null,
        required: input.required ?? true,
        options: input.valueType === 'SELECT' ? (input.options || []) : Prisma.JsonNull,
        sortOrder: input.sortOrder ?? this.nextSortOrder(peers),
        defaultValue: input.defaultValue === undefined ? Prisma.JsonNull : (input.defaultValue as Prisma.InputJsonValue),
      },
    });
  }

  async updateInput(id: string, input: Partial<InputDefinitionInput>) {
    const row = await this.prisma.assessmentInputDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Calibration input not found.');

    if (input.code && input.code.trim().toUpperCase() !== row.code) {
      const code = input.code.trim().toUpperCase();
      const clash = await this.prisma.assessmentInputDefinition.findUnique({
        where: { questionnaireVersionId_code: { questionnaireVersionId: row.questionnaireVersionId, code } },
      });
      if (clash) throw new BadRequestException(`Calibration input ${code} already exists.`);
    }

    const valueType = input.valueType ?? row.valueType;
    return this.prisma.assessmentInputDefinition.update({
      where: { id },
      data: {
        code: input.code ? input.code.trim().toUpperCase() : undefined,
        label: input.label?.trim(),
        guidance: input.guidance === undefined ? undefined : input.guidance?.trim() || null,
        valueType: input.valueType,
        unit: input.unit === undefined ? undefined : input.unit?.trim() || null,
        required: input.required,
        options:
          input.options === undefined
            ? undefined
            : valueType === 'SELECT'
              ? (input.options || [])
              : Prisma.JsonNull,
        sortOrder: input.sortOrder,
        defaultValue:
          input.defaultValue === undefined
            ? undefined
            : input.defaultValue === null
              ? Prisma.JsonNull
              : (input.defaultValue as Prisma.InputJsonValue),
      },
    });
  }

  async deleteInput(id: string) {
    const row = await this.prisma.assessmentInputDefinition.findUnique({
      where: { id },
      include: { _count: { select: { values: true } } },
    });
    if (!row) throw new NotFoundException('Calibration input not found.');
    if (row._count.values > 0) {
      throw new BadRequestException(
        `Cannot delete ${row.code}: it is used by ${row._count.values} assessment answer(s).`,
      );
    }
    await this.prisma.assessmentInputDefinition.delete({ where: { id } });
    return { deleted: true, id };
  }

  async createQuestion(versionId: string, input: QuestionInput) {
    await this.getVersionOrThrow(versionId);
    const code = input.code.trim().toUpperCase();
    const existing = await this.prisma.question.findUnique({
      where: { questionnaireVersionId_code: { questionnaireVersionId: versionId, code } },
    });
    if (existing) throw new BadRequestException(`Question ${code} already exists.`);

    const peers = await this.prisma.question.findMany({
      where: { questionnaireVersionId: versionId },
      select: { sortOrder: true },
    });

    const options = (input.options || []).filter((o) => o.label?.trim());
    if (!options.length) throw new BadRequestException('Add at least one response option.');

    return this.prisma.question.create({
      data: {
        questionnaireVersionId: versionId,
        code,
        category: input.category.trim(),
        text: input.text.trim(),
        guidance: input.guidance?.trim() || null,
        evidenceHint: input.evidenceHint?.trim() || null,
        weight: input.weight,
        required: input.required ?? true,
        sortOrder: input.sortOrder ?? this.nextSortOrder(peers),
        options: {
          create: options.map((o, index) => ({
            label: o.label.trim(),
            riskScore: Number(o.riskScore),
            sortOrder: o.sortOrder ?? index + 1,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateQuestion(id: string, input: Partial<QuestionInput>) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { options: true },
    });
    if (!question) throw new NotFoundException('Question not found.');

    if (input.code && input.code.trim().toUpperCase() !== question.code) {
      const code = input.code.trim().toUpperCase();
      const clash = await this.prisma.question.findUnique({
        where: {
          questionnaireVersionId_code: {
            questionnaireVersionId: question.questionnaireVersionId,
            code,
          },
        },
      });
      if (clash) throw new BadRequestException(`Question ${code} already exists.`);
    }

    await this.prisma.question.update({
      where: { id },
      data: {
        code: input.code ? input.code.trim().toUpperCase() : undefined,
        category: input.category?.trim(),
        text: input.text?.trim(),
        guidance: input.guidance === undefined ? undefined : input.guidance?.trim() || null,
        evidenceHint: input.evidenceHint === undefined ? undefined : input.evidenceHint?.trim() || null,
        weight: input.weight,
        required: input.required,
        sortOrder: input.sortOrder,
      },
    });

    if (input.options) {
      await this.syncOptions(id, input.options);
    }

    return this.prisma.question.findUnique({
      where: { id },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  private async syncOptions(questionId: string, options: OptionInput[]) {
    const cleaned = options.filter((o) => o.label?.trim());
    if (!cleaned.length) throw new BadRequestException('A question must keep at least one response option.');

    const existing = await this.prisma.responseOption.findMany({
      where: { questionId },
      include: { _count: { select: { responses: true } } },
    });
    const keepIds = new Set(cleaned.map((o) => o.id).filter(Boolean) as string[]);

    for (const row of existing) {
      if (keepIds.has(row.id)) continue;
      if (row._count.responses > 0) {
        throw new BadRequestException(
          `Cannot remove option “${row.label}”: it is used by ${row._count.responses} answer(s).`,
        );
      }
      await this.prisma.responseOption.delete({ where: { id: row.id } });
    }

    for (let index = 0; index < cleaned.length; index += 1) {
      const option = cleaned[index];
      const sortOrder = option.sortOrder ?? index + 1;
      if (option.id) {
        await this.prisma.responseOption.update({
          where: { id: option.id },
          data: {
            label: option.label.trim(),
            riskScore: Number(option.riskScore),
            sortOrder,
          },
        });
      } else {
        await this.prisma.responseOption.create({
          data: {
            questionId,
            label: option.label.trim(),
            riskScore: Number(option.riskScore),
            sortOrder,
          },
        });
      }
    }
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        _count: { select: { responses: true, recommendationRules: true } },
        options: { include: { _count: { select: { responses: true } } } },
      },
    });
    if (!question) throw new NotFoundException('Question not found.');
    if (question._count.responses > 0) {
      throw new BadRequestException(
        `Cannot delete ${question.code}: it is used by ${question._count.responses} assessment answer(s).`,
      );
    }
    if (question._count.recommendationRules > 0) {
      throw new BadRequestException(
        `Cannot delete ${question.code}: it is linked to ${question._count.recommendationRules} recommendation rule(s).`,
      );
    }
    const usedOptions = question.options.filter((o) => o._count.responses > 0);
    if (usedOptions.length) {
      throw new BadRequestException(`Cannot delete ${question.code}: one or more options have answers.`);
    }

    await this.prisma.responseOption.deleteMany({ where: { questionId: id } });
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true, id };
  }

  async updateAssumption(
    id: string,
    input: {
      label?: string;
      value?: number;
      description?: string;
      unit?: string;
      formulaUsage?: string;
      changeReason?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    },
    userId?: string,
  ) {
    const existing = await this.prisma.calibrationAssumption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assumption not found.');

    const usedBySubmitted = await this.prisma.assessmentSession.count({
      where: {
        questionnaireVersionId: existing.questionnaireVersionId,
        status: {
          in: [
            'SUBMITTED',
            'AUTOMATED_EVALUATION_COMPLETE',
            'EVIDENCE_REVIEW',
            'ANALYST_REVIEW',
            'QUALITY_ASSURANCE',
            'APPROVED',
            'REPORT_GENERATED',
            'REPORT_ISSUED',
            'REMEDIATION_IN_PROGRESS',
            'CLOSED',
            'ARCHIVED',
          ],
        },
      },
    });

    if (usedBySubmitted > 0 && input.value !== undefined && Number(input.value) !== Number(existing.value)) {
      throw new BadRequestException(
        'This assumption is used by submitted or approved assessments. Publish a new methodology version instead of editing the value in place.',
      );
    }

    return this.prisma.calibrationAssumption.update({
      where: { id },
      data: {
        label: input.label,
        value: input.value,
        description: input.description,
        unit: input.unit,
        formulaUsage: input.formulaUsage,
        changeReason: input.changeReason,
        status: input.status,
        approvedById: userId,
      },
    });
  }
}
