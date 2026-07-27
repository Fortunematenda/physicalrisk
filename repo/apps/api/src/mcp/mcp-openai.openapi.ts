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
          'JSON with projectCode, module, documentType, title, documentContent; optional owner, description, approvedBy. '
          + 'For revisions add mode=NEW_VERSION and existingDocumentId or documentCode. '
          + 'Server defaults date, MIME, filename, Rev.',
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
      version: '1.15.1',
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
          summary: 'Check duplicates; returns newVersionSubmitHints',
          description:
            'If exists=true, copy matches[0].newVersionSubmitHints into submit payload for NEW_VERSION.',
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
            'Pass only payload. After approve: list project/type/module, then submit. '
            + 'Do not ask date/MIME/filename/version. Put full Markdown in documentContent. '
            + 'NEW_VERSION needs mode + existingDocumentId or documentCode.',
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

FIELD MAPPING (never swap — be accurate and consistent)
- projectCode = Repository Project (e.g. MOSS). From list_repository_projects.
- module = Repository Module / folder (e.g. Articles, Research Library). From list_repository_modules. NOT document type.
- documentType = Document classification (e.g. Article, Technical Specification). From list_document_types. NOT the folder name.
- Correct pair example: module=Articles + documentType=Article.
- Wrong: documentType=Articles (that is a folder) or module=Article (that is a type).

════════════════════════════════════
APPROVAL / IMPORT FLOW (mandatory)
════════════════════════════════════
When the user says any of: approved / I approve / please import / import this / submit / import to my repo:

STEP A — Load live options (call tools NOW, before asking anything)
1) list_repository_projects
2) list_document_types
3) If the user already named a project, list_repository_modules for that projectCode; otherwise wait until they pick a project, then call list_repository_modules.

STEP B — Selection menus (ChatGPT cannot render real dropdowns; numbered lists are required so the user can tap/reply with a number)

Ask ONE menu at a time (project → then document type → then module). Never dump all three in one message unless the user already gave some answers.

Format EVERY option with an explicit Arabic number on its own line (mandatory — never a bare bullet list):

Select project — reply with a number only:
1. MOSS — MOSS
2. PROR — Operating Repository
3. …

After they pick a project number, call list_repository_modules, then:

Select document type — reply with a number only:
1. Article
2. Technical Specification
3. …

Then:

Select module (folder) — reply with a number only:
1. Articles
2. Research Library
3. …

Rules for menus:
- Use ONLY values returned by the tools (never invent projects/types/modules).
- Every row MUST start with "1." "2." "3." etc. Unnumbered lists are forbidden.
- If the user already stated any choice clearly, skip that menu.
- End each menu with exactly: "Reply with the number only (e.g. 2)."
- Prefer short messages so ChatGPT can offer suggested-reply chips when available.

STEP C — Auto fields (NEVER ask the user)
- approvalDate = today (server default if omitted)
- mimeType = application/pdf (server converts Markdown → PDF)
- fileName = from title.pdf (server default)
- versionNo = Rev 1.0 for NEW (or server bump for NEW_VERSION)
- approvalStatus = APPROVED
- approvedBy = Wayne (or the named approver if already known)
- owner = same as approvedBy
- description = 1–2 sentence summary YOU write from the document
- documentContent = the FULL Markdown you already generated in THIS chat (never ask the user to paste it again)

STEP D — Import immediately after selections are complete
As soon as project + documentType + module are known:
1) Optional: check_document_exists (title or code) — if exists and user wants another version, use matches[0].newVersionSubmitHints (mode=NEW_VERSION).
2) Call submit_approved_document ONCE with payload JSON string containing at least:
   projectCode, module, documentType, title, documentContent, owner, description, approvedBy
3) Do NOT ask for date, MIME, filename, version, or content again.
4) On success report: imported, documentCode, sectionName, importJobId, result.message.
5) Only mention Import Queue if needsReview=true.

FORBIDDEN
- Asking for Approval date, MIME type, Original filename, Version, Approved by, Owner, or "the document itself" after you already wrote it in chat.
- Submitting before project + documentType + module are selected (unless the user already provided all three).
- Claiming Import Queue always needs a human, or that versioning is unsupported.
- Swapping module and documentType.

NEW VERSION
- If user asks for another version of an existing document: check_document_exists → newVersionSubmitHints → submit with mode=NEW_VERSION after the same project/type/module confirmation if needed.
- Server bumps Rev (e.g. Rev 1.0 → Rev 1.1).

Example payload after user picks Project=MOSS, Type=Article, Module=Articles:
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"The Goat","owner":"Wayne","description":"Overview of goats as domestic animals.","approvedBy":"Wayne","documentContent":"# The Goat\\n\\n...full markdown..."}

Tools: list_repository_projects, list_document_types, list_repository_modules, check_document_exists, submit_approved_document, get_import_status.`;
