/**
 * OpenAPI for ChatGPT Custom GPT Actions.
 *
 * UnrecognizedKwargsError workaround: submit/prepare take a single string field `payload`
 * (JSON object as string) so the model cannot invent extra kwargs.
 */
export function buildChatGptActionsOpenApi(publicBaseUrl: string) {
  const baseUrl = publicBaseUrl.replace(/\/+$/, '') || 'https://repo.physicalrisk.com';

  const ok = {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            result: {
              type: 'object',
              properties: {
                accepted: { type: 'boolean' },
                ready: { type: 'boolean' },
                uploadUrl: { type: 'string' },
                importJobId: { type: 'string' },
                status: { type: 'string' },
                exists: { type: 'boolean' },
                instructions: { type: 'string' },
                message: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  };
  const err = {
    description: 'Error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
      },
    },
  };
  const responses = { '200': ok, '400': err, '401': err, '403': err };
  const security = [{ McpBearer: [] }];

  const payloadSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON string. Minimum for same-chat approve: projectCode, module, documentType, title, '
          + 'documentContent (full Markdown from the chat). '
          + 'Repo converts Markdown → PDF and queues the PDF. '
          + 'Server defaults: versionNo=Rev 1.0, approvalStatus=APPROVED, approvedBy=Wayne, '
          + 'approvalDate=today, fileName from title.pdf. '
          + 'Example: {"projectCode":"MOSS","module":"Research Library","documentType":"Articles",'
          + '"title":"Cow","documentContent":"# Cow\\n\\nA cow is...","approvedBy":"Wayne"}',
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Same-chat: research → generate → approve → submit with documentContent. '
        + 'Repo converts Markdown to PDF, applies routing rules / module, imports into the folder, '
        + 'and updates the Master Document Index. Queue only if routing or duplicates need a human. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.11.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/tools/list_repository_projects': {
        post: {
          operationId: 'list_repository_projects',
          summary: 'List repository projects',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { unused: { type: 'boolean' } } },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/list_document_types': {
        post: {
          operationId: 'list_document_types',
          summary: 'List document types',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { unused: { type: 'boolean' } } },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/list_repository_modules': {
        post: {
          operationId: 'list_repository_modules',
          summary: 'List project modules',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectCode: { type: 'string' },
                    projectId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/check_document_exists': {
        post: {
          operationId: 'check_document_exists',
          summary: 'Check for duplicate documents',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectCode: { type: 'string' },
                    title: { type: 'string' },
                    fileName: { type: 'string' },
                  },
                },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/submit_approved_document': {
        post: {
          operationId: 'submit_approved_document',
          summary: 'Submit approved document to Import Queue',
          description:
            'Pass ONLY payload. After user approval, call immediately with documentContent. '
            + 'Do not ask the user for version/date/filename/mime — server defaults those.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: payloadSchema,
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/prepare_approved_document': {
        post: {
          operationId: 'prepare_approved_document',
          summary: 'Prepare or submit (alias)',
          description: 'Same as submit_approved_document.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: payloadSchema,
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/get_import_status': {
        post: {
          operationId: 'get_import_status',
          summary: 'Get import job status',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['importJobId'],
                  properties: { importJobId: { type: 'string' } },
                },
              },
            },
          },
          responses,
        },
      },
    },
    components: {
      schemas: {
        Placeholder: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
      securitySchemes: {
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Full mcp_… API key as Bearer token',
        },
      },
    },
  };
}

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant for Wayne.

FIELD MAPPING (never swap)
- projectCode = Repository Project (e.g. MOSS)
- module = Repository Module (e.g. Research Library, Enterprise Architecture). Validate with list_repository_modules.
- documentType = Document Type (e.g. Articles). Validate with list_document_types.

SAME-CHAT FLOW
1) Research — help; do not submit.
2) Generate — write full Markdown in chat.
3) When user says approved / I approve / please import / submit — YOU MUST CALL submit_approved_document IMMEDIATELY.
   Do NOT ask for version, approval date, filename, or MIME type.
   Put the Markdown you already wrote in this chat into documentContent.
   Repo converts Markdown → PDF, applies admin routing rules (or the module you sent), imports into that folder, and updates the Master Document Index. No Import Queue step when routing succeeds.

FORBIDDEN after approval
- Asking again for Version, Approval date, Original filename, MIME type, or "the document itself" if you already generated it in this chat.
- Claiming a human must always finish Import Queue — only say that when result.needsReview is true.

SUBMIT
- One argument only: payload (JSON string).
- Minimum payload: projectCode, module, documentType, title, documentContent, approvedBy (if named).
- Server defaults: versionNo=Rev 1.0, approvalStatus=APPROVED, approvalDate=today, approvedBy=Wayne if omitted.
- On success report: imported, documentCode, sectionName, importJobId, and result.message.
- If needsReview=true, tell the user to open Import Queue (routing/duplicate issue).

Example:
submit_approved_document with payload =
{"projectCode":"MOSS","module":"Research Library","documentType":"Articles","title":"Cow","approvedBy":"Wayne","documentContent":"# Cow\\n\\nA cow is a domesticated mammal..."}

Also: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, get_import_status.`;
