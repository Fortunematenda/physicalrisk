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

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Repository tools for Custom GPT Actions. Use only APPROVED documents with submit_approved_document. '
        + 'Files are queued for human review — never written straight to final storage. '
        + `Privacy policy: ${baseUrl}/privacy`,
      version: '1.1.0',
    },
    servers: [{ url: baseUrl }],
    tags: [{ name: 'MCP', description: 'Physical Risk Repository MCP tools' }],
    paths: {
      '/api/mcp/tools/list_repository_projects': {
        post: {
          operationId: 'list_repository_projects',
          tags: ['MCP'],
          summary: 'List repository projects',
          description:
            'List active repository projects allowed for this MCP integration. Call with an empty JSON body {}.',
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'No parameters. Send {}.',
                  properties: {
                    unused: {
                      type: 'boolean',
                      description: 'Optional unused field so schema validators accept the object.',
                    },
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
          description: 'List active document types. Call with an empty JSON body {}.',
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'No parameters. Send {}.',
                  properties: {
                    unused: {
                      type: 'boolean',
                      description: 'Optional unused field so schema validators accept the object.',
                    },
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
          description: 'List active repository modules (sections) for a project.',
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  additionalProperties: false,
                  properties: {
                    projectId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Repository project UUID from list_repository_projects',
                    },
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
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  additionalProperties: false,
                  properties: {
                    projectId: { type: 'string', format: 'uuid' },
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
            'Queues an APPROVED document for human review in the Import Queue. '
            + 'approvalStatus must be APPROVED. Do not submit drafts or unapproved content.',
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'projectId',
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
                    title: { type: 'string' },
                    documentCode: { type: 'string' },
                    documentType: { type: 'string', description: 'Document type code or name' },
                    description: { type: 'string' },
                    owner: { type: 'string' },
                    versionNo: { type: 'string' },
                    approvalStatus: { type: 'string', enum: ['APPROVED'] },
                    approvedBy: { type: 'string' },
                    approvalDate: { type: 'string', description: 'ISO date or date-time' },
                    sectionKey: { type: 'string' },
                    metadataJson: { type: 'string' },
                    relationshipsJson: { type: 'string' },
                    mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
                    existingDocumentId: { type: 'string', format: 'uuid' },
                    fileName: { type: 'string' },
                    fileContentBase64: {
                      type: 'string',
                      description: 'Base64-encoded file bytes (keep files reasonably small for ChatGPT Actions)',
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
          security: [{ McpBearer: [] }, { McpApiKey: [] }],
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

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant.

You have Actions that call the Repository MCP API. For any question about projects, modules, document types, whether a document exists, submitting approved documents, or import status, you MUST call the matching Action immediately. Never say you lack tools if Actions are configured. Never invent project IDs, module IDs, or document type codes.

Workflow:
1. When asked which projects are available, call list_repository_projects with body {}.
2. When asked for document types, call list_document_types with body {}.
3. Before submitting a file, call list_repository_projects (and list_repository_modules / list_document_types as needed) so the user picks valid IDs.
4. Only call submit_approved_document when approvalStatus is APPROVED and the user confirms the metadata.
5. After submit, return the import job id and offer to call get_import_status.

If an Action returns 401, tell the user the MCP API key in the GPT is missing or wrong.
If an Action returns 403, tell the user the integration does not allow that tool or project.
If the project list is empty, tell the user to allow projects on the MCP integration in Repo → Settings → MCP Integrations.`;
