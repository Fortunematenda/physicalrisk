/**
 * OpenAPI for ChatGPT Custom GPT Actions.
 * Custom GPTs cannot reliably send multipart/binary files, so document upload
 * uses a JSON chunked base64 flow: begin_document_upload → upload_document_chunk → submit_approved_document.
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
                uploadId: { type: 'string' },
                received: { type: 'integer' },
                complete: { type: 'boolean' },
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
        'Submit APPROVED documents to the Import Queue using JSON Actions. '
        + 'Upload files via begin_document_upload + upload_document_chunk (base64 chunks), then submit_approved_document with uploadId. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.5.0',
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
                schema: {
                  type: 'object',
                  properties: { unused: { type: 'boolean' } },
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
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { unused: { type: 'boolean' } },
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
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectCode: { type: 'string', description: 'e.g. MOSS' },
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
      '/api/mcp/tools/begin_document_upload': {
        post: {
          operationId: 'begin_document_upload',
          summary: 'Start chunked base64 upload',
          description: 'ChatGPT cannot send multipart files. Split the PDF into base64 chunks of max 3500 characters.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileName', 'totalChunks'],
                  properties: {
                    fileName: { type: 'string' },
                    totalChunks: { type: 'integer', minimum: 1, maximum: 500 },
                    mimeType: { type: 'string', description: 'e.g. application/pdf' },
                  },
                },
              },
            },
          },
          responses,
        },
      },
      '/api/mcp/tools/upload_document_chunk': {
        post: {
          operationId: 'upload_document_chunk',
          summary: 'Upload one base64 chunk',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['uploadId', 'index', 'total', 'data'],
                  properties: {
                    uploadId: { type: 'string' },
                    index: { type: 'integer', minimum: 0 },
                    total: { type: 'integer', minimum: 1 },
                    data: {
                      type: 'string',
                      description: 'Base64 chunk, max ~3500 characters',
                    },
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
          summary: 'Submit APPROVED document after chunked upload',
          description: 'Pass uploadId from begin_document_upload after all chunks are uploaded. JSON only — no multipart.',
          security,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'uploadId',
                    'projectCode',
                    'module',
                    'documentType',
                    'title',
                    'versionNo',
                    'approvalStatus',
                    'approvedBy',
                    'approvalDate',
                    'fileName',
                  ],
                  properties: {
                    uploadId: { type: 'string', description: 'From begin_document_upload' },
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
          properties: { ok: { type: 'boolean' } },
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

IMPORTANT LIMITATION
Custom GPT Actions cannot send multipart/binary PDF uploads. Always use the chunked JSON upload flow.

FILE SUBMIT FLOW (required)
1) Read the uploaded PDF and convert it to base64.
2) Split the base64 string into chunks of at most 3500 characters.
3) Call begin_document_upload with fileName, totalChunks, mimeType=application/pdf. Save uploadId.
4) For each chunk i in 0..totalChunks-1 call upload_document_chunk with uploadId, index=i, total=totalChunks, data=chunk.
5) Call check_document_exists with projectCode + title/fileName.
6) Call submit_approved_document with ONLY:
   uploadId, projectCode, module, documentType, title, versionNo, approvalStatus=APPROVED, approvedBy, approvalDate, fileName
   Do not pass other kwargs. Do not use multipart. Do not invent UUIDs.

DEFINITIONS
- projectCode e.g. MOSS
- module e.g. Enterprise Architecture (NOT document type)
- documentType e.g. Articles (NAME/CODE string)

AUTO-POPULATE from PDF when possible; ask only for missing project/module/documentType/approver/date.
After submit, return importJobId and remind a human must finish Import Queue review.

If upload fails, report the API error message exactly.`;
