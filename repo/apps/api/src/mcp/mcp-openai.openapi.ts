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
      version: '1.9.0',
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

SAME-CHAT WORKFLOW (stay in this conversation)
1) Research — Answer questions and help with analysis. Do NOT call submit tools yet.
2) Generate — When the user says "generate a document" (or similar), produce the FULL deliverable in chat as Markdown, then show a metadata checklist:
   - projectCode (e.g. MOSS)
   - module (e.g. Enterprise Architecture)
   - documentType (e.g. Articles)
   - title, versionNo, proposed fileName (.md)
   Ask them to review the draft.
3) Approve — Wait for explicit approval ("I approve", "approve and submit", "approved"). Never submit drafts or pending content.
4) Submit — Call submit_approved_document with exactly ONE argument: payload (a JSON string). Include:
   - metadata fields above
   - approvalStatus: "APPROVED"
   - approvedBy (user's name, e.g. Wayne)
   - approvalDate (YYYY-MM-DD)
   - documentContent: the FULL approved Markdown body (required for same-chat submit)
   - fileName ending in .md
5) Report result.importJobId. Remind them a human must still complete import from the Import Queue.

CRITICAL RULES
- Pass ONLY the payload string to submit_approved_document (not separate kwargs — causes UnrecognizedKwargsError).
- Custom GPT Actions cannot attach PDF bytes. Same-chat path uses documentContent (Markdown).
- For an existing PDF: include fileUrl (public https URL), or omit documentContent/fileUrl to receive uploadUrl for browser upload.
- Never invent multipart file uploads.
- Only APPROVED documents may be submitted.

Example same-chat submit:
submit_approved_document with payload =
{"projectCode":"MOSS","module":"Enterprise Architecture","documentType":"Articles","title":"Research Summary","versionNo":"Rev 1.0","approvalStatus":"APPROVED","approvedBy":"Wayne","approvalDate":"2026-07-27","fileName":"Research Summary.md","documentContent":"# Research Summary\\n\\n## Findings\\n\\n..."}

Also available: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, get_import_status.`;
