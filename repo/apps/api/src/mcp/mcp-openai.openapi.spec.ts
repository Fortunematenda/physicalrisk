import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('publishes all six Actions with a real server URL', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.servers[0].url).toBe('https://repo.physicalrisk.com');
    expect(Object.keys(doc.paths)).toEqual([
      '/api/mcp/tools/list_repository_projects',
      '/api/mcp/tools/list_document_types',
      '/api/mcp/tools/list_repository_modules',
      '/api/mcp/tools/resolve_import_targets',
      '/api/mcp/tools/check_document_exists',
      '/api/mcp/tools/submit_approved_document',
      '/api/mcp/tools/get_import_status',
    ]);
    for (const path of Object.keys(doc.paths)) {
      const post = (doc.paths as Record<string, { post: { operationId: string; requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown> } } } } } }>)[path].post;
      expect(post.operationId).toBeTruthy();
      const schema = post.requestBody?.content['application/json']?.schema;
      if (schema) {
        expect(schema.properties).toBeDefined();
        expect(Object.keys(schema.properties!).length).toBeGreaterThan(0);
      }
    }
  });
});
