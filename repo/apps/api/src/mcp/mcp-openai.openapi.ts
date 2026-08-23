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
                total: { type: 'integer' },
                count: { type: 'integer' },
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

  const emptyBody = {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', properties: { unused: { type: 'boolean' } } },
      },
    },
  };

  const workspaceCodeBody = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['workspaceCode'],
          properties: { workspaceCode: { type: 'string', description: 'e.g. WS-2026-00003' } },
        },
      },
    },
  };

  const revisionFields = {
    mode: {
      type: 'string',
      enum: ['NEW', 'NEW_VERSION'],
      description:
        'NEW_VERSION adds a revision to an existing document. Use with documentCode (e.g. MOSS-GS-003) or existingDocumentId.',
    },
    documentCode: {
      type: 'string',
      description: 'Existing repository document code, e.g. MOSS-GS-003 (for NEW_VERSION).',
    },
    existingDocumentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of existing document (alternative to documentCode for NEW_VERSION).',
    },
  };

  /** Browser upload URL — exact binary; no Markdown. */
  const prepareFilePreserveSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON: projectCode, module, documentType, title, fileName (.docx/.xlsx/.pdf). '
          + 'For revisions: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). No documentContent.',
      },
      fileName: {
        type: 'string',
        description: 'Original filename with extension, e.g. Governance-Standard.docx',
      },
      ...revisionFields,
    },
  };

  const payloadSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON: projectCode, module, documentType, title, documentContent; optional owner, description, '
          + 'approvedBy, fileName, outputFormat (pdf|docx|xlsx|pptx|txt). '
          + 'Spreadsheet/.xlsx → outputFormat=xlsx + fileName=*.xlsx (never PDF). '
          + 'Revisions: mode=NEW_VERSION + existingDocumentId/documentCode.',
      },
      outputFormat: {
        type: 'string',
        enum: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'],
        description:
          'Set xlsx when chat has Spreadsheet/.xlsx. Also include inside payload.',
      },
      fileName: {
        type: 'string',
        description: 'e.g. Plan.xlsx / Report.docx / Deck.pptx / Notes.txt',
      },
    },
  };

  /** FILE_PRESERVE — original bytes; no Markdown rebuild. */
  const filePreservePayloadSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON metadata: projectCode, module, documentType, title, fileName (.xlsx/.docx/.pdf/.pptx). '
          + 'Put fileUrl OR uploadId OR fileContentBase64 here OR as top-level fields. '
          + 'Never documentContent — that rebuilds and loses Excel sheets/formulas.',
      },
      fileUrl: {
        type: 'string',
        format: 'uri',
        description:
          'Public https URL of the original .xlsx/.docx/.pdf/.pptx. Repo downloads exact bytes (preferred for Excel).',
      },
      uploadId: {
        type: 'string',
        description: 'Upload session id from begin_document_upload / chunked upload or browser prepare flow.',
      },
      fileContentBase64: {
        type: 'string',
        description: 'Base64 of the original binary workbook/document (exact bytes; use for small files).',
      },
      fileName: {
        type: 'string',
        description: 'Original name with extension, e.g. Budget.xlsx or Report.docx',
      },
      mimeType: {
        type: 'string',
        description:
          'Optional MIME. For Excel use application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      ...revisionFields,
    },
  };

  /** CONTENT_CREATE — intentional Markdown → generated document. */
  const contentCreatePayloadSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON: projectCode, module, documentType, title, documentContent; optional fileName, '
          + 'outputFormat (pdf|docx|xlsx|pptx|txt), mode=NEW_VERSION, workspaceCode.',
      },
      outputFormat: {
        type: 'string',
        enum: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'],
        description: 'Generated format when creating from Markdown (default pdf).',
      },
      fileName: {
        type: 'string',
        description: 'e.g. Plan.xlsx / Report.docx',
      },
    },
  };

  const post = (
    operationId: string,
    summary: string,
    requestBody: unknown,
    description?: string,
  ) => ({
    post: {
      operationId,
      summary,
      ...(description ? { description } : {}),
      security,
      requestBody,
      responses,
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'DOCX and XLSX binary import IS SUPPORTED. ChatGPT Actions cannot attach file bytes — '
        + 'call prepare_approved_document (or submit_approved_file) and give the user result.uploadUrl '
        + 'to upload the exact .docx/.xlsx in a browser (FILE_PRESERVE; sheets/formulas kept). '
        + 'NEVER claim the connector only accepts Markdown→PDF. '
        + 'Use submit_approved_content only for intentional Markdown imports. '
        + 'Supports NEW and NEW_VERSION (mode=NEW_VERSION + documentCode e.g. MOSS-GS-003). '
        + 'search_documents lists the Master Document Index. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.28.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      // Binary import first so ChatGPT Actions discover DOCX/XLSX support immediately.
      '/api/mcp/tools/upload_original_docx': post(
        'upload_original_docx',
        'Get uploadUrl for exact DOCX/XLSX (no Markdown)',
        {
          required: true,
          content: { 'application/json': { schema: prepareFilePreserveSchema } },
        },
        'Returns uploadUrl only. Metadata payload must be small. NEVER send documentContent. '
          + 'User uploads exact .docx in browser. NEW_VERSION + documentCode supported.',
      ),
      '/api/mcp/tools/prepare_approved_document': post(
        'prepare_approved_document',
        'Upload URL for original DOCX/XLSX/PDF (exact binary)',
        {
          required: true,
          content: { 'application/json': { schema: prepareFilePreserveSchema } },
        },
        'PRIMARY for original DOCX/XLSX/PDF/PPTX. Returns uploadUrl — user uploads exact binary. '
          + 'NEW_VERSION: mode=NEW_VERSION + documentCode. Never send documentContent (causes 413).',
      ),
      '/api/mcp/tools/submit_approved_file': post(
        'submit_approved_file',
        'Import original DOCX/XLSX/PDF/PPTX bytes (exact)',
        {
          required: true,
          content: { 'application/json': { schema: filePreservePayloadSchema } },
        },
        'FILE_PRESERVE: exact original Excel/Word/PDF/PPTX. ZERO-CLICK: pass fileUrl or fileContentBase64/uploadId. '
          + 'uploadUrl only if no URL/bytes. Never Markdown→PDF for originals.',
      ),
      '/api/mcp/tools/list_repository_projects': post(
        'list_repository_projects',
        'List repository projects',
        emptyBody,
      ),
      '/api/mcp/tools/list_document_types': post(
        'list_document_types',
        'List document types',
        emptyBody,
      ),
      '/api/mcp/tools/list_repository_modules': post(
        'list_repository_modules',
        'List project modules',
        {
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
      ),
      '/api/mcp/tools/resolve_import_targets': post(
        'resolve_import_targets',
        'Resolve project/module/type names to IDs',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project'],
                properties: {
                  project: { type: 'string', description: 'Project code or name (e.g. MCRD)' },
                  module: { type: 'string', description: 'Folder/module name' },
                  documentType: { type: 'string' },
                },
              },
            },
          },
        },
        'Map human labels to projectId/sectionKey/documentType before submit.',
      ),
      '/api/mcp/tools/search_documents': post(
        'search_documents',
        'List/search Master Document Index',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  search: { type: 'string', description: 'Title, code, or type text' },
                  projectCode: { type: 'string', description: 'e.g. MCRD' },
                  projectId: { type: 'string' },
                  status: { type: 'string' },
                  limit: { type: 'integer', minimum: 1, maximum: 200 },
                },
              },
            },
          },
        },
        'Use for how many / list all / what was imported. Returns compact index rows.',
      ),
      '/api/mcp/tools/get_document': post(
        'get_document',
        'Get one document by id or code',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  documentId: { type: 'string' },
                  documentCode: { type: 'string', description: 'e.g. MCRD-AS1-012' },
                },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/check_document_exists': post(
        'check_document_exists',
        'Check duplicates; returns newVersionSubmitHints',
        {
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
        'If exists=true, copy matches[0].newVersionSubmitHints into submit payload for NEW_VERSION.',
      ),
      '/api/mcp/tools/submit_approved_content': post(
        'submit_approved_content',
        'Create document from Markdown/text',
        {
          required: true,
          content: { 'application/json': { schema: contentCreatePayloadSchema } },
        },
        'CONTENT_CREATE: intentional Markdown → generated file. Set outputFormat for Office/TXT. '
          + 'Do not use when an original DOCX/XLSX/PDF must be preserved.',
      ),
      '/api/mcp/tools/submit_approved_document': post(
        'submit_approved_document',
        'Legacy submit (prefer prepare or submit_approved_file)',
        {
          required: true,
          content: { 'application/json': { schema: payloadSchema } },
        },
        'Legacy. Prefer prepare_approved_document for originals, submit_approved_content for Markdown. '
          + 'DOCX/XLSX fileName without bytes returns uploadUrl (no Markdown→PDF).',
      ),
      '/api/mcp/tools/get_import_status': post(
        'get_import_status',
        'Get import job status',
        {
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
      ),
      '/api/mcp/tools/create_workspace': post(
        'create_workspace',
        'Create Repository Workspace (WS-YYYY-#####)',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'projectCode'],
                properties: {
                  name: { type: 'string' },
                  projectCode: {
                    type: 'string',
                    description: 'Project code from list_repository_projects (e.g. MCRD)',
                  },
                  projectId: { type: 'string' },
                },
              },
            },
          },
        },
        'Returns workspaceCode to resume from another chat. Prefer projectCode (MCRD/MOSS/PROR).',
      ),
      '/api/mcp/tools/get_workspace': post('get_workspace', 'Get workspace by code', workspaceCodeBody),
      '/api/mcp/tools/find_workspaces': post(
        'find_workspaces',
        'Find workspaces for current user',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  workspaceCode: { type: 'string' },
                  name: { type: 'string' },
                  projectCode: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/get_latest_pending_workspace': post(
        'get_latest_pending_workspace',
        'Latest pending workspace for current user',
        {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: {} } } },
        },
      ),
      '/api/mcp/tools/get_workspace_summary': post(
        'get_workspace_summary',
        'Workspace summary with documents',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/list_workspace_documents': post(
        'list_workspace_documents',
        'List documents in a workspace',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/resume_workspace': post(
        'resume_workspace',
        'Resume workspace by code',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/validate_workspace': post(
        'validate_workspace',
        'Validate workspace before submit',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/submit_workspace': post(
        'submit_workspace',
        'Submit ready workspace for import',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/attach_document_to_workspace': post(
        'attach_document_to_workspace',
        'Attach imported document to workspace',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceCode'],
                properties: {
                  workspaceCode: { type: 'string' },
                  documentCode: { type: 'string', description: 'e.g. MCRD-AS1-012' },
                  documentId: { type: 'string' },
                  importJobId: { type: 'string' },
                },
              },
            },
          },
        },
      ),
    },
    components: {
      schemas: {
        Placeholder: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
      securitySchemes: {
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Full mcp_ API key as Bearer token',
        },
      },
    },
  };
}

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant.

CRITICAL FACT (never contradict this):
The Repo connector SUPPORTS exact DOCX, XLSX, PDF, and PPTX import. It is NOT Markdown-only. It does NOT require converting Office files to PDF.
ChatGPT Actions/MCP cannot attach binary bytes as a native file — that is a ChatGPT limitation, not a Repo limitation.

ZERO-CLICK IMPORT (use this when user says approved / import / submit — do NOT ask them to open a link first):
1) Prefer submit_approved_file with fileUrl=https://… to the exact .docx/.xlsx (FILE_PRESERVE). Repo downloads bytes and queues import.
2) Or submit_approved_file with fileContentBase64 / uploadId (chunked begin_document_upload + upload_document_chunk) if you can transmit the exact bytes.
3) For revisions: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003).
4) Poll get_import_status. Never Markdown. Never split the catalogue.
Only if the user has no HTTPS fileUrl AND you cannot send bytes: then prepare_approved_document / upload_original_docx and give uploadUrl (one browser upload).

NEVER convert DOCX to Markdown for import. NEVER put catalogue text into documentContent.
If you see "request entity too large" / 413: you wrongly sent Markdown. Discard it. Ask for a short HTTPS fileUrl or use uploadUrl — never paste Markdown.
NEVER say: "the connector cannot import DOCX", "only accepts Markdown", "converts to PDF only", or "split into smaller documents".
When user says approved/import: attempt zero-click submit_approved_file (fileUrl/base64) immediately — do not default to "open this link".

FIELD MAPPING (never swap)
- projectCode = Repository Project (e.g. MOSS). From list_repository_projects.
- module = Repository Module / folder (e.g. Articles). From list_repository_modules. NOT document type.
- documentType = Document classification (e.g. Article). From list_document_types. NOT the folder name.
- Correct: module=Articles + documentType=Article. Wrong: documentType=Articles or module=Article.

LIST / SEARCH / COUNT (mandatory)
When user asks how many / list / what was imported / show index:
1) Call search_documents NOW (optional projectCode / search / limit).
2) Report total + compact table: documentCode, title, projectCode, module, currentVersion, updatedAt.
3) Detail: get_document with documentCode (preferred) or documentId.
Never invent documents. Never say the connector cannot list documents.

ORIGINAL DOCX / XLSX / PDF / PPTX
1) After project + documentType + module known → ZERO-CLICK: submit_approved_file with fileUrl (or fileContentBase64/uploadId).
2) Only if no fileUrl/bytes → prepare_approved_document / upload_original_docx → uploadUrl (one browser upload).
3) get_import_status with importJobId.
4) Never paste large documents into documentContent.

IMPORT MODE
1) Original file with HTTPS link or bytes → submit_approved_file (zero-click).
2) Original file only in chat and no URL → prepare + uploadUrl (one click unavoidable).
3) Markdown you wrote (no original Office file) → submit_approved_content + outputFormat.

APPROVAL FLOW
When user says approved / import / submit:
STEP A — list_repository_projects, list_document_types; after project pick, list_repository_modules.
STEP B — Numbered menus one at a time (project → type → module). "Reply with the number only (e.g. 2)."
STEP C — Auto: approvalDate=today; versionNo=Rev 1.0; approvalStatus=APPROVED; omit approvedBy unless user named themselves; description=1–2 sentences.
STEP D — Original file: ask for a public HTTPS fileUrl if needed, then submit_approved_file (zero-click). Only if no URL/bytes → prepare + uploadUrl. Markdown-only → submit_approved_content.

FORBIDDEN
- Claiming Repo only accepts Markdown→PDF.
- Converting DOCX/XLSX/PPTX to PDF.
- Pasting large documents into documentContent.
- Swapping module and documentType; hardcoded approvedBy.

NEW VERSION + original DOCX/XLSX (e.g. MOSS-GS-003) — ZERO CLICK preferred:
1) check_document_exists with documentCode → copy newVersionSubmitHints.
2) If user gives HTTPS fileUrl (or you have exact bytes): submit_approved_file with mode=NEW_VERSION, documentCode=MOSS-GS-003, fileName=*.docx, fileUrl/fileContentBase64. Done — no browser link.
3) Only if no URL and no bytes: upload_original_docx / prepare_approved_document → uploadUrl (one upload).
4) get_import_status with importJobId. Never Markdown→PDF. Never split the document.
WORKSPACES: create_workspace → return WS-YYYY-#####.

Tools: list_repository_projects, list_document_types, list_repository_modules, resolve_import_targets, search_documents, get_document, check_document_exists, upload_original_docx, prepare_approved_document, submit_approved_file, submit_approved_content, submit_approved_document, get_import_status, create_workspace, get_workspace, find_workspaces, get_latest_pending_workspace, get_workspace_summary, list_workspace_documents, resume_workspace, validate_workspace, submit_workspace, attach_document_to_workspace.`;
