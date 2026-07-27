import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('uses a single payload string for submit to avoid UnrecognizedKwargsError', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.10.0');
    const submit = (doc.paths as any)['/api/mcp/tools/submit_approved_document'].post;
    expect(submit.requestBody.content['application/json'].schema.required).toEqual(['payload']);
    expect(submit.requestBody.content['application/json'].schema.properties.payload.type).toBe('string');
    expect(submit.requestBody.content['application/json'].schema.properties.payload.description).toContain('documentContent');
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });
});
