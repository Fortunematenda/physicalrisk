/**
 * OpenAPI document for ChatGPT Custom GPT Actions.
 * Prefer this over JSON-RPC when wiring ChatGPT Actions.
 */
export function buildChatGptActionsOpenApi(publicBaseUrl: string) {
  const baseUrl = publicBaseUrl.replace(/\/+$/, '') || 'https://repo.physicalrisk.com';

  const emptyOk = {
    '200': {
      description: 'Tool result',
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true },
        },
      },
    },
    '401': { description: 'Invalid or missing MCP API key' },
    '403': { description: 'Tool or project not allowed for this integration' },
  };

  const mcpSecurity = [{ McpBearer: [] }, { McpApiKey: [] }];

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Repository tools for Custom GPT Actions. Use only APPROVED documents with submit_approved_document. '
        + 'Files are queued for human review — never written straight to final storage. '
        + 'Prefer resolve_import_targets with human-readable names (e.g. project=MOSS, module=Enterprise Architecture, documentType=Articles). '
        + `Privacy policy: ${baseUrl}/privacy`,
      version: '1.2.0',
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
          security: mcpSecurity,
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    unused: { type: 'boolean', description: 'Optional unused field for schema validators' },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/list_document_types': {
        post: {
          operationId: 'list_document_types',
          tags: ['MCP'],
          summary: 'List document types',
          description: 'List active document types. Call with {}.',
          security: mcpSecurity,
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    unused: { type: 'boolean', description: 'Optional unused field for schema validators' },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/list_repository_modules': {
        post: {
          operationId: 'list_repository_modules',
          tags: ['MCP'],
          summary: 'List project modules',
          description: 'List active modules for a project. Pass projectId UUID or projectCode/name (e.g. MOSS).',
          security: mcpSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    projectId: { type: 'string', format: 'uuid' },
                    projectCode: { type: 'string', description: 'Project code or name if UUID unknown' },
                  },
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/resolve_import_targets': {
        post: {
          operationId: 'resolve_import_targets',
          tags: ['MCP'],
          summary: 'Resolve names to submission IDs',
          description:
            'Resolve human-readable project / module / document type names into projectId, sectionKey, and documentType. '
            + 'Call this before check_document_exists and submit_approved_document when the user gives names like MOSS / Enterprise Architecture / Articles.',
          security: mcpSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['project'],
                  additionalProperties: false,
                  properties: {
                    project: { type: 'string', description: 'Project code, name, or UUID (e.g. MOSS)' },
                    module: { type: 'string', description: 'Module name, code, or sectionKey' },
                    documentType: { type: 'string', description: 'Document type name or code (e.g. Articles)' },
                  },
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/check_document_exists': {
        post: {
          operationId: 'check_document_exists',
          tags: ['MCP'],
          summary: 'Check whether a document already exists',
          security: mcpSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    projectId: { type: 'string', format: 'uuid' },
                    projectCode: { type: 'string' },
                    title: { type: 'string' },
                    fileName: { type: 'string' },
                    checksum: { type: 'string' },
                    documentCode: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/submit_approved_document': {
        post: {
          operationId: 'submit_approved_document',
          tags: ['MCP'],
          summary: 'Submit an APPROVED document into the Import Queue',
          description:
            'Queues an APPROVED document for human review. Provide projectId OR projectCode. '
            + 'documentType accepts name or code. sectionKey comes from resolve_import_targets / list_repository_modules.',
          security: mcpSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'title',
                    'documentType',
                    'versionNo',
                    'approvalStatus',
                    'approvedBy',
                    'approvalDate',
                    'fileName',
                    'fileContentBase64',
                  ],
                  additionalProperties: false,
                  properties: {
                    projectId: { type: 'string', format: 'uuid' },
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
                    title: { type: 'string' },
                    documentCode: { type: 'string' },
                    documentType: { type: 'string', description: 'Name or code, e.g. Articles' },
                    description: { type: 'string' },
                    owner: { type: 'string' },
                    versionNo: { type: 'string' },
                    approvalStatus: { type: 'string', enum: ['APPROVED'] },
                    approvedBy: { type: 'string' },
                    approvalDate: { type: 'string' },
                    sectionKey: { type: 'string' },
                    module: {
                      type: 'string',
                      description: 'Module/section name (e.g. Enterprise Architecture). Resolved server-side to sectionKey.',
                    },
                    metadataJson: { type: 'string' },
                    relationshipsJson: { type: 'string' },
                    mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
                    existingDocumentId: { type: 'string', format: 'uuid' },
                    fileName: { type: 'string' },
                    fileContentBase64: {
                      type: 'string',
                      description: 'Base64-encoded file bytes',
                    },
                    mimeType: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
      '/api/mcp/tools/get_import_status': {
        post: {
          operationId: 'get_import_status',
          tags: ['MCP'],
          summary: 'Get import job status',
          security: mcpSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['importJobId'],
                  additionalProperties: false,
                  properties: {
                    importJobId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: emptyOk,
        },
      },
    },
    components: {
      securitySchemes: {
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Paste the full MCP API key (starts with mcp_). ChatGPT sends Authorization: Bearer <key>.',
        },
        McpApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-MCP-API-Key',
          description: 'Alternative: send the full mcp_… key in the X-MCP-API-Key header.',
        },
      },
    },
  };
}

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant for submitting APPROVED documents to the Import Queue.

CRITICAL BEHAVIOR
- Always use Actions. Never say you lack IDs, cannot get metadata, or cannot submit when Actions are configured.
- You do NOT need UUIDs. Prefer human-readable values:
  - projectCode or project name (e.g. "MOSS")
  - module name (e.g. "Enterprise Architecture")
  - documentType name or code (e.g. "Articles" or "AR")
- Call resolve_import_targets when helpful, but you may also submit directly with projectCode + module + documentType.
- When the user says the document is APPROVED (or approvalStatus is APPROVED) and you have enough fields, you MUST run duplicate check then submit in the same turn. Do not keep asking for IDs.

AUTO-POPULATE FROM THE UPLOADED FILE
When a PDF/file is uploaded, extract and prefill without asking again if present:
- title (document title)
- versionNo (e.g. Rev 1.0)
- fileName (original filename)
- approvalDate (prefer the latest signature/approval date in the file)
- approvedBy (if only one clear approver; if multiple signatories, ask once which name to use)
- approvalStatus = APPROVED when the user says approved / signed / approved document

ASK ONLY WHAT IS MISSING
Ask at most these if not already known from the file or prior answers:
1) Repository Project (if more than one allowed project and not specified)
2) Repository Module
3) Document Type
4) Approved by (only if multiple signatories and unclear)
5) Approval date (only if unclear)

Do not re-ask fields the user already confirmed.
Do not ask for UUIDs, section keys, or "repository metadata identifiers".

DEFAULT SUBMISSION FLOW (once APPROVED + required fields are known)
1) Optionally call resolve_import_targets with project, module, documentType.
2) Call check_document_exists with projectCode/projectId + title and/or fileName.
3) Call submit_approved_document with:
   - projectCode (e.g. MOSS) OR projectId
   - module (e.g. Enterprise Architecture) OR sectionKey
   - documentType (e.g. Articles)
   - title, versionNo, approvalStatus=APPROVED, approvedBy, approvalDate
   - fileName + fileContentBase64 from the uploaded file
4) Return importJobId/status and remind that a human must finish import in the Import Queue.

For the user's recent case, once they said use Articles with MOSS / Enterprise Architecture / Wayne Hermanson / 2026-07-03 / APPROVED, you should have submitted immediately — not stopped for "module and document type identifiers".

Errors:
- 401 → MCP API key missing/wrong in GPT auth settings
- 403 → allow the project/tools on the MCP integration
- 404 from resolve_import_targets → show available modules/types from the error and ask user to pick one`;
