import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('publishes prepare_approved_document as the ChatGPT submit path', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/api/mcp/tools/prepare_approved_document');
    expect(Object.keys(doc.paths)).toContain('/api/mcp/tools/submit_approved_document');
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_document'].post.requestBody.content['application/json']).toBeTruthy();
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });
});
