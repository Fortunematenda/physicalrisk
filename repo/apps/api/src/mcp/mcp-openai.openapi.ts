/**
 * OpenAPI for ChatGPT Custom GPT Actions.
 * Custom GPTs cannot send PDF bytes. Primary flow: prepare_approved_document → browser uploadUrl.
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

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Approved Document intake for ChatGPT. Because Custom GPT Actions cannot send PDF bytes, '
        + 'call prepare_approved_document then give the user the uploadUrl to upload the PDF in a browser. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.6.0',
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
      '/api/mcp/tools/resolve_import_targets': {
        post: {
          operationId: 'resolve_import_targets',
          summary: 'Resolve project/module/document type names',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['project'],
                  properties: {
                    project: { type: 'string' },
                    module: { type: 'string' },
                    documentType: { type: 'string' },
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
                    projectId: { type: 'string' },
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
      '/api/mcp/tools/prepare_approved_document': {
        post: {
          operationId: 'prepare_approved_document',
          summary: 'Create browser upload link for APPROVED document',
          description:
            'PREFERRED. Returns uploadUrl. Tell the user to open it and upload the PDF. '
            + 'Do not attempt multipart or base64 file transfer from ChatGPT.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
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
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
                    module: { type: 'string', description: 'e.g. Enterprise Architecture' },
                    documentType: { type: 'string', description: 'e.g. Articles' },
                    title: { type: 'string' },
                    versionNo: { type: 'string' },
                    approvalStatus: { type: 'string', enum: ['APPROVED'] },
                    approvedBy: { type: 'string' },
                    approvalDate: { type: 'string', description: 'YYYY-MM-DD' },
                    fileName: { type: 'string' },
                    mimeType: { type: 'string' },
                    projectId: { type: 'string' },
                    sectionKey: { type: 'string' },
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
          summary: 'Alias: create browser upload link (same as prepare_approved_document)',
          description:
            'Same as prepare_approved_document. Returns uploadUrl for browser PDF upload. '
            + 'Do not pass file, fileContentBase64, or uploadId from ChatGPT.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
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
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
                    module: { type: 'string', description: 'e.g. Enterprise Architecture' },
                    documentType: { type: 'string', description: 'e.g. Articles' },
                    title: { type: 'string' },
                    versionNo: { type: 'string' },
                    approvalStatus: { type: 'string', enum: ['APPROVED'] },
                    approvedBy: { type: 'string' },
                    approvalDate: { type: 'string', description: 'YYYY-MM-DD' },
                    fileName: { type: 'string' },
                    mimeType: { type: 'string' },
                    projectId: { type: 'string' },
                    sectionKey: { type: 'string' },
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

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant.

CRITICAL
Custom GPT Actions cannot send PDF bytes. Never pass file/fileContentBase64/uploadId.

SUBMIT FLOW
1) Confirm metadata (auto-fill from PDF text when possible).
2) check_document_exists with projectCode + title/fileName.
3) Call prepare_approved_document OR submit_approved_document with ONLY these JSON fields:
   projectCode, module, documentType, title, versionNo, approvalStatus=APPROVED, approvedBy, approvalDate, fileName
4) The tool returns uploadUrl. Give that link to the user and tell them to open it, choose the PDF, and click Upload.
5) After upload, they get an Import Job ID on the success page / Import Queue.

Do not pass any other kwargs (no file, no Base64, no multipart).
Module = Enterprise Architecture. Document Type = Articles.
Never invent UUIDs.`;
