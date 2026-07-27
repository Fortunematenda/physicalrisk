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
          'JSON object string. Required: projectCode, module, documentType, title, versionNo, '
          + 'approvalStatus, approvedBy, approvalDate. '
          + 'Same-chat submit: include documentContent (full Markdown body) and optional fileName (.md). '
          + 'PDF alternatives: fileUrl (public URL) or omit both to receive uploadUrl for browser upload. '
          + 'Example: {"projectCode":"MOSS","module":"Enterprise Architecture","documentType":"Articles",'
          + '"title":"Research Note","versionNo":"Rev 1.0","approvalStatus":"APPROVED","approvedBy":"Wayne",'
          + '"approvalDate":"2026-07-27","fileName":"Research Note.md","documentContent":"# Research Note\\n\\n..."}',
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Approved Document intake for ChatGPT. Same-chat flow: research → generate → approve → '
        + 'submit with documentContent (Markdown). PDF via fileUrl or browser uploadUrl. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.9.1',
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
          summary: 'Submit approved document (documentContent / fileUrl / upload link)',
          description:
            'Pass ONLY payload (JSON string). Prefer documentContent for same-chat Markdown submit. '
            + 'fileUrl for public PDF. Without either, returns uploadUrl for browser upload.',
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
          description: 'Same as submit_approved_document. Pass ONLY payload JSON string.',
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

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant for Wayne and other reviewers.

FIELD MAPPING (never swap these)
- projectCode = Repository Project (e.g. MOSS)
- module = Repository Module / section (e.g. Enterprise Architecture). Call list_repository_modules to validate.
- documentType = Document Type catalog value (e.g. Articles). Call list_document_types to validate.
- Do NOT put "Articles" in module or "Enterprise Architecture" in documentType unless list tools confirm that.

SAME-CHAT WORKFLOW (stay in this conversation)
1) Research — Help with analysis. Do NOT submit yet.
2) Generate — On "generate a document", write the FULL Markdown deliverable in chat, then show a checklist with defaults already filled (see PREPOPULATE). Ask only for corrections.
3) Approve — On "I approve" / "approve and submit" / "approved", submit immediately using PREPOPULATE defaults + the Markdown you already generated as documentContent. Do not ask again for version, MIME, filename, or approval fields unless the user wants different values.
4) After submit — Report importJobId. A human still finishes Import Queue review.

PREPOPULATE (required — do not refuse to fill these)
When generating or submitting, set these yourself unless the user overrides:
- versionNo: "Rev 1.0"
- approvalStatus: "APPROVED"
- approvedBy: the user's name if known (default "Wayne"), else ask once
- approvalDate: today's date as YYYY-MM-DD
- fileName: sanitize title + ".md" (e.g. title "cow type" → "cow type.md")
- mimeType: "text/markdown"
- documentContent: the full Markdown body you generated in this chat (required for same-chat submit)

You MAY invent these defaults. You must NOT invent project/module/documentType — use list tools or user confirmation.

SUBMIT RULES
- Call submit_approved_document with exactly ONE argument: payload (JSON string). No separate kwargs.
- Include projectCode, module, documentType, title, versionNo, approvalStatus, approvedBy, approvalDate, fileName, mimeType, documentContent.
- Actions cannot attach PDF bytes. For PDFs use fileUrl or omit documentContent to get uploadUrl.
- Only APPROVED documents may be submitted.

Example:
submit_approved_document with payload =
{"projectCode":"MOSS","module":"Enterprise Architecture","documentType":"Articles","title":"cow type","versionNo":"Rev 1.0","approvalStatus":"APPROVED","approvedBy":"Wayne","approvalDate":"2026-07-27","fileName":"cow type.md","mimeType":"text/markdown","documentContent":"# cow type\\n\\n..."}

Also available: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, get_import_status.`;
