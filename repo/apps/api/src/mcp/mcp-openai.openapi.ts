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
        'BINARY ORIGINAL FILE IMPORT (v1.31): check_document_exists, upload_original_docx, '
        + 'prepare_automatic_file_import, upload_original_file_chunk, complete_automatic_file_import, '
        + 'finalize_original_file_import. Prefer @Repo MCP connector. Never Markdown→PDF. '
        + 'NEW_VERSION: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.31.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/tools/check_document_exists': post(
        'check_document_exists',
        'Check duplicates before import; use NEW_VERSION hints',
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
        'If exists=true, use mode=NEW_VERSION + documentCode. Never create duplicate codes.',
      ),
      '/api/mcp/tools/upload_original_docx': post(
        'upload_original_docx',
        'PRIMARY binary DOCX/XLSX/PDF/PPTX FILE_PRESERVE upload (NEW_VERSION supported)',
        {
          required: true,
          content: { 'application/json': { schema: prepareFilePreserveSchema } },
        },
        'Returns uploadId+uploadUrl (PUT exact original bytes) then finalize_original_file_import. '
          + 'Use for MOSS-GS-003 mode=NEW_VERSION. Never Markdown→PDF.',
      ),
      '/api/mcp/tools/prepare_automatic_file_import': post(
        'prepare_automatic_file_import',
        'Start automatic chunked FILE_PRESERVE session',
        {
          required: true,
          content: { 'application/json': { schema: prepareFilePreserveSchema } },
        },
        'Returns uploadId+uploadToken+acceptedChunkSize. Then upload_original_file_chunk automatically.',
      ),
      '/api/mcp/tools/upload_original_file_chunk': post(
        'upload_original_file_chunk',
        'Upload one exact binary chunk (base64)',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uploadId', 'uploadToken', 'chunkIndex', 'chunkSha256', 'rawByteLength'],
                properties: {
                  uploadId: { type: 'string' },
                  uploadToken: { type: 'string' },
                  chunkIndex: { type: 'integer' },
                  encodedContent: { type: 'string' },
                  chunkBase64: { type: 'string' },
                  chunkSha256: { type: 'string' },
                  rawByteLength: { type: 'integer' },
                },
              },
            },
          },
        },
        'Idempotent chunk upload. Continue until complete_automatic_file_import.',
      ),
      '/api/mcp/tools/complete_automatic_file_import': post(
        'complete_automatic_file_import',
        'Assemble/validate chunks then queue FILE_PRESERVE',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uploadId', 'uploadToken'],
                properties: {
                  uploadId: { type: 'string' },
                  uploadToken: { type: 'string' },
                  expectedSha256: { type: 'string' },
                  payload: { type: 'string' },
                },
              },
            },
          },
        },
        'Validates OOXML/PDF + SHA-256. Success only after validation.',
      ),
      '/api/mcp/tools/finalize_original_file_import': post(
        'finalize_original_file_import',
        'Verify original-file SHA-256 after staged PUT or automatic import',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uploadId'],
                properties: {
                  uploadId: { type: 'string' },
                  uploadToken: { type: 'string' },
                },
              },
            },
          },
        },
        'Returns UPLOAD_PENDING, VERIFIED, VERIFICATION_FAILED, or IMPORTED.',
      ),
      '/api/mcp/tools/import_original_file': post(
        'import_original_file',
        'Zero-click FILE_PRESERVE via HTTPS fileUrl',
        {
          required: true,
          content: { 'application/json': { schema: filePreservePayloadSchema } },
        },
        'Downloads exact original bytes from fileUrl. NEVER Markdown or PDF conversion. NEW_VERSION + documentCode supported.',
      ),
      '/api/mcp/tools/submit_approved_file': post(
        'submit_approved_file',
        'Import original DOCX/XLSX/PDF/PPTX bytes (exact)',
        {
          required: true,
          content: { 'application/json': { schema: filePreservePayloadSchema } },
        },
        'FILE_PRESERVE via fileUrl/fileContentBase64/uploadId. Prefer import_original_file for HTTPS URLs.',
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
The Repo connector SUPPORTS exact DOCX/XLSX/PDF/PPTX FILE_PRESERVE. It is NOT Markdown-only.
Binary tools ARE available: check_document_exists, upload_original_docx, prepare_automatic_file_import,
upload_original_file_chunk, complete_automatic_file_import, finalize_original_file_import, import_original_file.
When importing an existing Office/PDF file:
1) check_document_exists
2) prepare_automatic_file_import → upload_original_file_chunk (all chunks) → complete_automatic_file_import → finalize_original_file_import
   OR upload_original_docx → PUT uploadUrl → finalize_original_file_import
   OR import_original_file with fileUrl
NEVER convert Office originals to Markdown or PDF.
NEW_VERSION: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003).
Report IMPORTED only after size and SHA-256 match — not after creating a session.

FIELD MAPPING (never swap)
- projectCode = Repository Project (e.g. MOSS). From list_repository_projects.
- module = Repository Module / folder (e.g. Articles). From list_repository_modules. NOT document type.
- documentType = Document classification (e.g. Article). From list_document_types. NOT the folder name.

LIST / SEARCH / COUNT (mandatory)
When user asks how many / list / what was imported / show index:
1) Call search_documents NOW.
2) Report total + compact table: documentCode, title, projectCode, module, currentVersion, updatedAt.
3) Detail: get_document with documentCode.
Never invent documents.

APPROVAL FLOW
When user says approved / import / submit:
STEP A — list_repository_projects, list_document_types; after project pick, list_repository_modules.
STEP B — Numbered menus one at a time (project → type → module).
STEP C — Existing file: automatic FILE_PRESERVE tools above. Never Markdown→PDF for an attached DOCX.

FORBIDDEN
- Claiming Repo only accepts Markdown→PDF.
- Claiming upload_original_docx / prepare_automatic_file_import are unavailable.
- Converting DOCX/XLSX/PPTX to PDF.
- Creating a new unrelated document code when NEW_VERSION is required.

MOSS-GS-003 NEW_VERSION:
1) check_document_exists with documentCode=MOSS-GS-003.
2) prepare_automatic_file_import (mode=NEW_VERSION, documentCode=MOSS-GS-003, module=Governance Standards, documentType=Master Control Catalogue)
   → upload_original_file_chunk until complete → complete_automatic_file_import → finalize_original_file_import.
3) Or upload_original_docx with same metadata → PUT exact DOCX → finalize_original_file_import.

Tools: check_document_exists, upload_original_docx, prepare_automatic_file_import, upload_original_file_chunk, complete_automatic_file_import, finalize_original_file_import, import_original_file, list_repository_projects, list_document_types, list_repository_modules, resolve_import_targets, search_documents, get_document, get_import_status, create_workspace, get_workspace, attach_document_to_workspace.`;
