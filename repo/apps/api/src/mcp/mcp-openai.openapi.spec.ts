import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('publishes JSON chunked-upload Actions for ChatGPT', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual([
      '/api/mcp/tools/list_repository_projects',
      '/api/mcp/tools/list_document_types',
      '/api/mcp/tools/list_repository_modules',
      '/api/mcp/tools/resolve_import_targets',
      '/api/mcp/tools/check_document_exists',
      '/api/mcp/tools/begin_document_upload',
      '/api/mcp/tools/upload_document_chunk',
      '/api/mcp/tools/submit_approved_document',
      '/api/mcp/tools/get_import_status',
    ]);
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_document'].post.requestBody.content['application/json']).toBeTruthy();
    expect((doc.paths as any)['/api/mcp/submit-approved-document']).toBeUndefined();
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });
});
