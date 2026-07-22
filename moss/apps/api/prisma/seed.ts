import { PrismaClient, QuestionnaireStatus, SystemRole, ValueType, FindingSeverity } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

interface SeedData {
  name: string;
  code: string;
  version: string;
  status: string;
  description: string;
  inputs: Array<any>;
  questions: Array<any>;
  assumptions: Array<any>;
  recommendationRules: Array<any>;
}

async function seedMethodology() {
  const file = path.join(__dirname, 'scli-v1.1.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedData;

  const questionnaire = await prisma.questionnaire.upsert({
    where: { code: data.code },
    update: { name: data.name, description: data.description },
    create: { code: data.code, name: data.name, description: data.description },
  });

  const existingVersion = await prisma.questionnaireVersion.findUnique({
    where: { questionnaireId_version: { questionnaireId: questionnaire.id, version: data.version } },
  });

  // Published methodology versions are immutable. If this version already exists,
  // leave its questions, scores, assumptions and rules unchanged.
  if (existingVersion) return;

  const version = await prisma.questionnaireVersion.create({
    data: {
      questionnaireId: questionnaire.id,
      version: data.version,
      status: QuestionnaireStatus.PUBLISHED,
      methodologyNote: data.description,
      publishedAt: new Date(),
    },
  });

  for (const input of data.inputs) {
    await prisma.assessmentInputDefinition.upsert({
      where: { questionnaireVersionId_code: { questionnaireVersionId: version.id, code: input.code } },
      update: {
        label: input.label,
        guidance: input.guidance,
        valueType: input.valueType as ValueType,
        unit: input.unit,
        required: input.required,
        options: input.options,
        sortOrder: input.sortOrder,
        defaultValue: input.defaultValue,
      },
      create: {
        questionnaireVersionId: version.id,
        code: input.code,
        label: input.label,
        guidance: input.guidance,
        valueType: input.valueType as ValueType,
        unit: input.unit,
        required: input.required,
        options: input.options,
        sortOrder: input.sortOrder,
        defaultValue: input.defaultValue,
      },
    });
  }

  const questionIds = new Map<string, string>();
  for (const question of data.questions) {
    const record = await prisma.question.upsert({
      where: { questionnaireVersionId_code: { questionnaireVersionId: version.id, code: question.code } },
      update: {
        category: question.category,
        text: question.text,
        evidenceHint: question.evidenceHint,
        weight: question.weight,
        required: question.required,
        sortOrder: question.sortOrder,
      },
      create: {
        questionnaireVersionId: version.id,
        code: question.code,
        category: question.category,
        text: question.text,
        evidenceHint: question.evidenceHint,
        weight: question.weight,
        required: question.required,
        sortOrder: question.sortOrder,
      },
    });
    questionIds.set(question.code, record.id);
    for (const option of question.options) {
      await prisma.responseOption.upsert({
        where: { questionId_label: { questionId: record.id, label: option.label } },
        update: { riskScore: option.riskScore, sortOrder: option.sortOrder },
        create: { questionId: record.id, label: option.label, riskScore: option.riskScore, sortOrder: option.sortOrder },
      });
    }
  }

  for (const assumption of data.assumptions) {
    await prisma.calibrationAssumption.upsert({
      where: { questionnaireVersionId_code: { questionnaireVersionId: version.id, code: assumption.code } },
      update: { label: assumption.label, value: assumption.value, format: assumption.format, description: assumption.description },
      create: { questionnaireVersionId: version.id, code: assumption.code, label: assumption.label, value: assumption.value, format: assumption.format, description: assumption.description },
    });
  }

  for (const rule of data.recommendationRules) {
    await prisma.recommendationRule.upsert({
      where: { questionnaireVersionId_code: { questionnaireVersionId: version.id, code: rule.code } },
      update: {
        title: rule.title,
        category: rule.category,
        priority: rule.priority as FindingSeverity,
        triggerQuestionId: questionIds.get(rule.triggerQuestionCode),
        triggerMinRisk: rule.triggerMinRisk,
        summary: rule.summary,
        serviceOffering: rule.serviceOffering,
      },
      create: {
        questionnaireVersionId: version.id,
        code: rule.code,
        title: rule.title,
        category: rule.category,
        priority: rule.priority as FindingSeverity,
        triggerQuestionId: questionIds.get(rule.triggerQuestionCode),
        triggerMinRisk: rule.triggerMinRisk,
        summary: rule.summary,
        serviceOffering: rule.serviceOffering,
      },
    });
  }
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@physicalrisk.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'REDACTED_KEYCLOAK_ADMIN_PASSWORD';
  const passwordHash = await argon2.hash(password);
  const legacy = await prisma.user.findUnique({ where: { email: 'admin@physicalrisk.local' } });
  if (legacy && legacy.email !== email) {
    await prisma.user.update({
      where: { id: legacy.id },
      data: {
        email,
        passwordHash,
        firstName: 'Platform',
        lastName: 'Administrator',
        systemRole: SystemRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    return;
  }
  await prisma.user.upsert({
    where: { email },
    update: {
      isActive: true,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Administrator',
      systemRole: SystemRole.SUPER_ADMIN,
    },
    create: {
      email,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Administrator',
      systemRole: SystemRole.SUPER_ADMIN,
    },
  });
}

async function main() {
  await seedMethodology();
  await seedAdmin();
  console.log('MOSS seed completed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
