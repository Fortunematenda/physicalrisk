/**
 * OpenAPI document for ChatGPT Custom GPT Actions.
 * Kept deliberately strict: ChatGPT Actions only allow one security scheme,
 * require object schemas to include properties, and require components.schemas
 * to be an object.
 */
export function buildChatGptActionsOpenApi(publicBaseUrl: string) {
  const baseUrl = publicBaseUrl.replace(/\/+$/, '') || 'https://repo.physicalrisk.com';

  const toolResultSchema = {
    type: 'object',
    description: 'MCP tool response payload',
    properties: {
      tool: { type: 'string', description: 'Tool name when wrapped' },
      result: {
        type: 'object',
        description: 'Tool result object',
        properties: {
          accepted: { type: 'boolean' },
          importJobId: { type: 'string' },
          status: { type: 'string' },
          exists: { type: 'boolean' },
          message: { type: 'string' },
        },
        additionalProperties: true,
      },
      message: { type: 'string' },
      status: { type: 'string' },
    },
    additionalProperties: true,
  };

  const okResponse = {
    description: 'Tool result',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ToolResult' },
      },
    },
  };

  const errorResponse = {
    description: 'Error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResult' },
      },
    },
  };

  const responses = {
    '200': okResponse,
    '401': errorResponse,
    '403': errorResponse,
  };

  const bearerSecurity = [{ McpBearer: [] }];

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Repository tools for Custom GPT Actions. Use only APPROVED documents with submit_approved_document. '
        + 'Files are queued for human review — never written straight to final storage. '
        + 'Prefer resolve_import_targets with human-readable names (e.g. project=MOSS, module=Enterprise Architecture, documentType=Articles). '
        + `Privacy policy: ${baseUrl}/privacy`,
      version: '1.3.0',
    },
    servers: [{ url: baseUrl }],
    tags: [{ name: 'MCP', description: 'Physical Risk Repository MCP tools' }],
    paths: {
      '/api/mcp/tools/list_repository_projects': {
        post: {
          operationId: 'list_repository_projects',
          tags: ['MCP'],
          summary: 'List repository projects',
          description: 'List active repository projects allowed for this MCP integration. Call with {}.',
          security: bearerSecurity,
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmptyBody' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/list_document_types': {
        post: {
          operationId: 'list_document_types',
          tags: ['MCP'],
          summary: 'List document types',
          description: 'List active document types. Call with {}.',
          security: bearerSecurity,
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmptyBody' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/list_repository_modules': {
        post: {
          operationId: 'list_repository_modules',
          tags: ['MCP'],
          summary: 'List project modules',
          description: 'List active modules for a project. Pass projectId UUID or projectCode/name (e.g. MOSS).',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListModulesRequest' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/resolve_import_targets': {
        post: {
          operationId: 'resolve_import_targets',
          tags: ['MCP'],
          summary: 'Resolve names to submission IDs',
          description:
            'Resolve human-readable project / module / document type names into projectId, sectionKey, and documentType.',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ResolveTargetsRequest' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/check_document_exists': {
        post: {
          operationId: 'check_document_exists',
          tags: ['MCP'],
          summary: 'Check whether a document already exists',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CheckExistsRequest' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/submit-approved-document': {
        post: {
          operationId: 'submit_approved_document',
          tags: ['MCP'],
          summary: 'Submit an APPROVED document (multipart file upload)',
          description:
            'PREFERRED for ChatGPT. Attach the user-uploaded PDF as multipart field "file". '
            + 'Use projectCode (e.g. MOSS), module name (e.g. Enterprise Architecture), and documentType name/code (e.g. Articles). '
            + 'Do NOT require UUIDs. Do NOT invent Base64 — attach the uploaded file.',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/SubmitApprovedDocumentRequest' },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/get_import_status': {
        post: {
          operationId: 'get_import_status',
          tags: ['MCP'],
          summary: 'Get import job status',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetImportStatusRequest' },
              },
            },
          },
          responses,
        },
      },
    },
    components: {
      schemas: {
        EmptyBody: {
          type: 'object',
          description: 'No parameters. Send {}.',
          properties: {
            unused: {
              type: 'boolean',
              description: 'Optional unused field for schema validators',
            },
          },
          additionalProperties: false,
        },
        ListModulesRequest: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project UUID if known' },
            projectCode: { type: 'string', description: 'Project code or name if UUID unknown' },
          },
          additionalProperties: false,
        },
        ResolveTargetsRequest: {
          type: 'object',
          required: ['project'],
          properties: {
            project: { type: 'string', description: 'Project code, name, or UUID (e.g. MOSS)' },
            module: { type: 'string', description: 'Module name, code, or sectionKey' },
            documentType: { type: 'string', description: 'Document type name or code (e.g. Articles)' },
          },
          additionalProperties: false,
        },
        CheckExistsRequest: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            projectCode: { type: 'string' },
            title: { type: 'string' },
            fileName: { type: 'string' },
            checksum: { type: 'string' },
            documentCode: { type: 'string' },
          },
          additionalProperties: false,
        },
        SubmitApprovedDocumentRequest: {
          type: 'object',
          required: [
            'file',
            'title',
            'documentType',
            'versionNo',
            'approvalStatus',
            'approvedBy',
            'approvalDate',
          ],
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: 'The uploaded PDF/document from the chat',
            },
            projectCode: {
              type: 'string',
              description: 'Project code or name (preferred). Example: MOSS',
            },
            projectId: {
              type: 'string',
              description: 'Optional UUID if already known',
            },
            module: {
              type: 'string',
              description: 'Repository module/section name. Example: Enterprise Architecture',
            },
            sectionKey: {
              type: 'string',
              description: 'Optional section key if already known',
            },
            documentType: {
              type: 'string',
              description: 'Document type NAME or CODE — not a UUID. Example: Articles or AR',
            },
            title: { type: 'string' },
            versionNo: { type: 'string', description: 'Example: Rev 1.0' },
            approvalStatus: { type: 'string', enum: ['APPROVED'] },
            approvedBy: { type: 'string' },
            approvalDate: { type: 'string', description: 'YYYY-MM-DD' },
            fileName: { type: 'string' },
            mimeType: { type: 'string' },
            mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          },
          additionalProperties: false,
        },
        GetImportStatusRequest: {
          type: 'object',
          required: ['importJobId'],
          properties: {
            importJobId: { type: 'string' },
          },
          additionalProperties: false,
        },
        ToolResult: toolResultSchema,
        ErrorResult: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
          additionalProperties: true,
        },
      },
      securitySchemes: {
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Paste the full MCP API key (starts with mcp_). ChatGPT sends Authorization: Bearer <key>.',
        },
      },
    },
  };
}

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant for submitting APPROVED documents to the Import Queue.

DEFINITIONS (do not confuse)
- Repository Project = e.g. MOSS (use projectCode="MOSS"; UUID optional)
- Repository Module = e.g. Enterprise Architecture (NOT a document type)
- Document Type = e.g. Articles / AR (a NAME or CODE string — NOT a UUID, NOT a module)

CRITICAL — FILE UPLOAD
- Use the Action submit_approved_document with multipart field "file".
- Attach the user-uploaded PDF directly to "file". NEVER say you cannot get Base64.
- Do not ask the user for Base64.

CRITICAL — IDENTIFIERS
- Prefer projectCode + module + documentType strings. UUIDs are optional.
- documentType is "Articles" (string), not a document type UUID.
- Never invent UUIDs. Never claim the API requires UUIDs when projectCode/module/documentType are available.

AUTO-POPULATE FROM PDF + CHAT
Prefill title, versionNo, fileName, approvalDate, approvedBy from the PDF when present.
Never re-ask fields already confirmed in the conversation.
When user says APPROVED / signed and required fields are known, immediately:
1) check_document_exists (projectCode + title/fileName)
2) submit_approved_document with multipart file + metadata
Return importJobId and remind a human must finish Import Queue review.

EXAMPLE SUBMIT (multipart)
- file: <the uploaded PDF>
- projectCode: MOSS
- module: Enterprise Architecture
- documentType: Articles
- title: MOSS Lean Revenue MVP – Timeline, Deliverables and Payment Milestones
- versionNo: Rev 1.0
- approvalStatus: APPROVED
- approvedBy: Wayne Hermanson
- approvalDate: 2026-07-03
- fileName: MOSS Lean Revenue MVP Timeline Deliverables Payment Milestones Signed Contract.pdf

ASK ONLY FOR TRUE GAPS (project/module/document type/approver/date) — at most once each.

Errors: 401=bad MCP key; 403=project/tool not allowed; 404=show available modules/types.`;
