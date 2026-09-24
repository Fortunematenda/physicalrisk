/**
 * Prefill SCLI calibration C1 (Organisation name) from the linked organisation
 * when the field is empty. Does not overwrite a value the user already entered.
 */
export async function seedScliOrganisationNameInput(
  // Accept PrismaService or a transaction client.
  db: {
    assessmentInputDefinition: {
      findUnique: (args: any) => Promise<{ id: string } | null>;
    };
    assessmentInputValue: {
      findUnique: (args: any) => Promise<{ value: unknown } | null>;
      upsert: (args: any) => Promise<unknown>;
    };
  },
  input: {
    assessmentId: string;
    questionnaireVersionId: string;
    organisationName?: string | null;
  },
): Promise<boolean> {
  const name = String(input.organisationName || '').trim();
  if (!name) return false;

  const definition = await db.assessmentInputDefinition.findUnique({
    where: {
      questionnaireVersionId_code: {
        questionnaireVersionId: input.questionnaireVersionId,
        code: 'C1',
      },
    },
    select: { id: true },
  });
  if (!definition) return false;

  const existing = await db.assessmentInputValue.findUnique({
    where: {
      assessmentId_inputDefinitionId: {
        assessmentId: input.assessmentId,
        inputDefinitionId: definition.id,
      },
    },
    select: { value: true },
  });
  if (existing) {
    const raw = existing.value;
    const text =
      typeof raw === 'string'
        ? raw.trim()
        : raw != null && typeof raw !== 'object'
          ? String(raw).trim()
          : '';
    if (text) return false;
  }

  await db.assessmentInputValue.upsert({
    where: {
      assessmentId_inputDefinitionId: {
        assessmentId: input.assessmentId,
        inputDefinitionId: definition.id,
      },
    },
    create: {
      assessmentId: input.assessmentId,
      inputDefinitionId: definition.id,
      value: name,
    },
    update: { value: name },
  });
  return true;
}
