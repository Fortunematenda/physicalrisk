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
          'JSON string. Same-chat approve fields: projectCode, module, documentType, title, documentContent, '
          + 'plus Document Information: owner, description (short summary), approvedBy. '
          + 'NEW DOCUMENT: omit mode/documentCode (server allocates code, versionNo defaults to Rev 1.0). '
          + 'NEW VERSION of an existing document: set mode=NEW_VERSION and existingDocumentId (from check_document_exists), '
          + 'or set documentCode (e.g. MOSS-AR-003). Server bumps versionNo automatically (e.g. Rev 1.0 → Rev 1.1). '
          + 'Optional: versionNo if you already know the next revision. '
          + 'Repo converts Markdown → PDF and imports with Document Information. '
          + 'Example new: {"projectCode":"MOSS","module":"Research Library","documentType":"Articles",'
          + '"title":"Cow","owner":"Wayne","description":"Overview of cattle.","documentContent":"# Cow\\n\\n...","approvedBy":"Wayne"} '
          + 'Example next version: {"projectCode":"MOSS","module":"Research Library","documentType":"Articles",'
          + '"title":"A Cow","mode":"NEW_VERSION","existingDocumentId":"<uuid>","documentCode":"MOSS-AR-003",'
          + '"documentContent":"# The Cow\\n\\n...","approvedBy":"Wayne"}',
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Same-chat: research → generate → approve → submit with documentContent. '
        + 'Supports NEW documents and NEW_VERSION revisions of existing documents '
        + '(mode=NEW_VERSION + existingDocumentId/documentCode; server bumps Rev). '
        + 'Repo converts Markdown to PDF, writes Document Information, applies routing, '
        + 'imports into the folder, and updates the Master Document Index. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.13.0',
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
          summary: 'Check for duplicates; returns newVersionSubmitHints for the next revision',
          description:
            'If exists=true, use matches[].newVersionSubmitHints (mode, existingDocumentId, documentCode, versionNo) '
            + 'inside submit_approved_document payload when the user wants another version of that document.',
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
                    documentCode: { type: 'string' },
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
          summary: 'Submit approved document (new or next version)',
          description:
            'Pass ONLY payload. After user approval, call immediately with documentContent. '
            + 'For a new revision of an existing document, include mode=NEW_VERSION and existingDocumentId '
            + '(or documentCode) from check_document_exists; server bumps versionNo. '
            + 'Do not claim versioning is unsupported.',
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
- owner = Document Information Owner (usually Wayne or the named author).
- description = short Document Information summary (1–2 sentences), not the full Markdown body.
- approvedBy = Approver shown on the version.
- mode = NEW (default) or NEW_VERSION (add a revision to an existing document).
- existingDocumentId / documentCode = identity of the existing document when mode=NEW_VERSION.

SAME-CHAT FLOW
1) Research — help; do not submit.
2) Generate — write full Markdown in chat.
3) When user says approved / I approve / please import / submit — YOU MUST CALL submit_approved_document IMMEDIATELY.
   Do NOT ask for version, approval date, filename, or MIME type.
   Put the Markdown you already wrote in this chat into documentContent.
   Also include owner and description so Document Information is complete.
   Repo converts Markdown → PDF, applies admin routing rules (or the module you sent), imports into that folder, and updates the Master Document Index. No Import Queue step when routing succeeds.

NEW VERSION (another revision of an existing document)
- The repository DOES support versioning via submit_approved_document. Never say it does not.
- When the user asks to import as another version / next revision / update existing (e.g. MOSS-AR-003):
  1) Call check_document_exists with projectCode + title or documentCode.
  2) Take matches[0].newVersionSubmitHints (mode, existingDocumentId, documentCode, versionNo).
  3) Call submit_approved_document with those fields plus module, documentType, documentContent, owner, description, approvedBy.
- Server bumps versionNo if you omit it or still send Rev 1.0 (e.g. Rev 1.0 → Rev 1.1).
- Keep the existing document title/code; do not invent a new title like "A Cow (Revised)" unless the user asks for a separate document.

FORBIDDEN after approval
- Asking again for Version, Approval date, Original filename, MIME type, or "the document itself" if you already generated it in this chat.
- Claiming a human must always finish Import Queue — only say that when result.needsReview is true.
- Claiming versioning / NEW_VERSION is unsupported.
- Submitting with only documentContent and omitting documentType / title / module.

SUBMIT
- One argument only: payload (JSON string).
- Required in payload: projectCode, module, documentType, title, documentContent.
- Strongly include: owner, description, approvedBy.
- For next version also include: mode=NEW_VERSION, existingDocumentId and/or documentCode.
- Server defaults: versionNo=Rev 1.0 for NEW; for NEW_VERSION server suggests the next Rev; approvalStatus=APPROVED; approvalDate=today; approvedBy=Wayne; owner=approvedBy; description from first Markdown paragraph if omitted.
- On success report: imported, documentCode, sectionName, importJobId, version if known, and result.message.
- If needsReview=true, tell the user to open Import Queue (routing/duplicate issue).

Example NEW:
{"projectCode":"MOSS","module":"Research Library","documentType":"Articles","title":"Cow","owner":"Wayne","description":"Overview of cattle.","approvedBy":"Wayne","documentContent":"# Cow\\n\\nA cow is..."}

Example NEW_VERSION:
{"projectCode":"MOSS","module":"Research Library","documentType":"Articles","title":"A Cow","mode":"NEW_VERSION","existingDocumentId":"<uuid-from-check>","documentCode":"MOSS-AR-003","owner":"Wayne","description":"Updated overview of cattle.","approvedBy":"Wayne","documentContent":"# The Cow\\n\\n..."}

Also: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, get_import_status.`;
