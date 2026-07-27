/**
 * OpenAPI for ChatGPT Custom GPT Actions.
 * Constraints from ChatGPT Actions validator:
 * - only one security scheme
 * - components.schemas must be an object
 * - object schemas need properties
 * - prefer OpenAPI 3.0.x
 * - avoid $ref in multipart request bodies (causes UnrecognizedKwargsError)
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
                importJobId: { type: 'string' },
                status: { type: 'string' },
                exists: { type: 'boolean' },
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

  return {
    openapi: '3.0.1',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Submit APPROVED documents to the Physical Risk Import Queue. '
        + 'Use human-readable projectCode/module/documentType. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.4.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/tools/list_repository_projects': {
        post: {
          operationId: 'list_repository_projects',
          summary: 'List repository projects',
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    unused: { type: 'boolean', description: 'Send false or omit' },
                  },
                },
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
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    unused: { type: 'boolean', description: 'Send false or omit' },
                  },
                },
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
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
                    projectId: { type: 'string', description: 'Optional UUID' },
                  },
                },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/resolve_import_targets': {
        post: {
          operationId: 'resolve_import_targets',
          summary: 'Resolve project/module/document type names',
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['project'],
                  properties: {
                    project: { type: 'string', description: 'e.g. MOSS' },
                    module: { type: 'string', description: 'e.g. Enterprise Architecture' },
                    documentType: { type: 'string', description: 'e.g. Articles' },
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
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
                    projectId: { type: 'string' },
                    title: { type: 'string' },
                    fileName: { type: 'string' },
                    documentCode: { type: 'string' },
                    checksum: { type: 'string' },
                  },
                },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/submit-approved-document': {
        post: {
          operationId: 'submit_approved_document',
          summary: 'Submit APPROVED document with uploaded file',
          description:
            'Attach the chat PDF as form field "file". '
            + 'Pass projectCode, module, documentType as plain strings (not UUIDs).',
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: [
                    'file',
                    'projectCode',
                    'module',
                    'documentType',
                    'title',
                    'versionNo',
                    'approvalStatus',
                    'approvedBy',
                    'approvalDate',
                  ],
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'Uploaded PDF from the conversation',
                    },
                    projectCode: {
                      type: 'string',
                      description: 'Project code e.g. MOSS',
                    },
                    module: {
                      type: 'string',
                      description: 'Module name e.g. Enterprise Architecture',
                    },
                    documentType: {
                      type: 'string',
                      description: 'Document type name/code e.g. Articles',
                    },
                    title: { type: 'string' },
                    versionNo: { type: 'string', description: 'e.g. Rev 1.0' },
                    approvalStatus: {
                      type: 'string',
                      enum: ['APPROVED'],
                    },
                    approvedBy: { type: 'string' },
                    approvalDate: {
                      type: 'string',
                      description: 'YYYY-MM-DD',
                    },
                    fileName: { type: 'string' },
                    projectId: { type: 'string' },
                    sectionKey: { type: 'string' },
                    mimeType: { type: 'string' },
                  },
                },
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
          security: [{ McpBearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['importJobId'],
                  properties: {
                    importJobId: { type: 'string' },
                  },
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
        Placeholder: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
          },
        },
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

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant.

When submitting an APPROVED document, call submit_approved_document with ONLY these fields:
- file = the uploaded PDF from the chat (multipart file field)
- projectCode (e.g. MOSS)
- module (e.g. Enterprise Architecture)
- documentType (e.g. Articles)  // NAME/CODE string, never a UUID
- title
- versionNo
- approvalStatus = APPROVED
- approvedBy
- approvalDate (YYYY-MM-DD)
- fileName (optional)

Do not pass any other kwargs. Do not pass fileContentBase64. Do not pass UUIDs unless the user gave them.
Do not invent parameters.

Workflow:
1) Auto-fill metadata from the PDF when possible.
2) Ask only for missing project/module/documentType/approver/date.
3) check_document_exists with projectCode + title/fileName.
4) submit_approved_document with the file attached.
5) Return importJobId and remind that a human must finish Import Queue review.

Module ≠ Document Type. "Articles" is Document Type. "Enterprise Architecture" is Module.`;
