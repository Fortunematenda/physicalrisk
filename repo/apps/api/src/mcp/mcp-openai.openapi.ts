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
          + 'Example new: {"projectCode":"MOSS","module":"Articles","documentType":"Article",'
          + '"title":"Cow","owner":"Wayne","description":"Overview of cattle.","documentContent":"# Cow\\n\\n...","approvedBy":"Wayne"} '
          + 'Example next version: {"projectCode":"MOSS","module":"Articles","documentType":"Article",'
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
      version: '1.14.1',
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
            'Pass ONLY payload. On user approval, call IMMEDIATELY with documentContent from this chat. '
            + 'NEVER ask the user for approvedBy, approvalDate, fileName, mimeType, owner, version, or description — '
            + 'server defaults those (or you fill owner/description yourself). '
            + 'For a new revision include mode=NEW_VERSION + existingDocumentId/documentCode. '
            + 'Do not claim versioning is unsupported or that Import Queue is always required.',
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

CRITICAL — AFTER THE USER APPROVES
When the user says approved / I approve / please import / submit / import to my repo:
- CALL submit_approved_document IMMEDIATELY. Do not ask questionnaire questions first.
- NEVER ask the user for: Approved by, Approval date, Original filename, MIME type, Owner, Version, Short description, or "the document content".
- YOU fill those yourself (see defaults below). Put the Markdown you already wrote in THIS chat into documentContent.
- NEVER say a human must always finish Import Queue. Only mention Import Queue if the tool result has needsReview=true.
- NEVER claim versioning is unsupported.

FIELD MAPPING (never swap)
- projectCode = Repository Project (e.g. MOSS). NOT the same as Document Type.
- module = Repository Module / folder (e.g. Articles, Research Library, Enterprise Architecture). Validate with list_repository_modules.
- documentType = Document classification (e.g. Article, Technical Specification, Decision Record) — NOT the folder name. Validate with list_document_types.
- Example: store an article in the Articles folder → module=Articles, documentType=Article.
- "MOSS Articles" usually means projectCode=MOSS, module=Articles, documentType=Article.
- owner / description / approvedBy = Document Information fields YOU set (defaults below). Do not interview the user for them.
- mode = NEW (default) or NEW_VERSION. existingDocumentId / documentCode when revising.

SAME-CHAT FLOW
1) Research — help; do not submit.
2) Generate — write full Markdown in chat.
3) On approval — call tools now:
   a) Optional: check_document_exists if this may be a revision.
   b) submit_approved_document with payload JSON string.

NEW VERSION
- Repo supports NEW_VERSION. If user wants another version of an existing doc: check_document_exists → use matches[0].newVersionSubmitHints → submit with mode=NEW_VERSION.
- Server bumps Rev if needed (Rev 1.0 → Rev 1.1).

SUBMIT PAYLOAD (one argument: payload JSON string)
Required: projectCode, module, documentType, title, documentContent.
You set (do not ask): owner=Wayne (or named author), description=1–2 sentence summary you write, approvedBy=Wayne, versionNo omitted (server defaults), approvalStatus=APPROVED, approvalDate omitted (server=today).
Server also defaults: fileName from title.pdf, mimeType=application/pdf after Markdown→PDF.
For next version also: mode=NEW_VERSION, existingDocumentId and/or documentCode from check_document_exists.
On success report: imported, documentCode, sectionName, importJobId, result.message.

Example:
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"The Cow: A Valuable Domestic Animal","owner":"Wayne","description":"Overview of the cow as a domestic animal and its dairy and farm value.","approvedBy":"Wayne","documentContent":"# The Cow...\\n\\n..."}

Also available: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, get_import_status.`;
