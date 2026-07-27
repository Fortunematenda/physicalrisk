import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('publishes ChatGPT-compatible Actions with a single Bearer scheme', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.0.1');
    expect(doc.servers[0].url).toBe('https://repo.physicalrisk.com');
    expect(Object.keys(doc.paths)).toEqual([
      '/api/mcp/tools/list_repository_projects',
      '/api/mcp/tools/list_document_types',
      '/api/mcp/tools/list_repository_modules',
      '/api/mcp/tools/resolve_import_targets',
      '/api/mcp/tools/check_document_exists',
      '/api/mcp/submit-approved-document',
      '/api/mcp/tools/get_import_status',
    ]);
    const submit = (doc.paths as any)['/api/mcp/submit-approved-document'].post;
    expect(submit.requestBody.content['multipart/form-data'].schema.properties.file.format).toBe('binary');
    expect(submit.requestBody.content['multipart/form-data'].schema.$ref).toBeUndefined();
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
    expect(typeof (doc.components as any).schemas).toBe('object');
  });
});
