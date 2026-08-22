import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('uses a single payload string for submit to avoid UnrecognizedKwargsError', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.23.0');
    expect((doc.paths as any)['/api/mcp/tools/search_documents']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/get_document']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/find_workspaces']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_file']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_content']).toBeDefined();
    const filePreserve = (doc.paths as any)['/api/mcp/tools/submit_approved_file'].post;
    const filePreserveSchema = filePreserve.requestBody.content['application/json'].schema;
    expect(filePreserveSchema.properties.payload.description).toContain('fileContentBase64');
    expect(filePreserveSchema.properties.fileUrl).toBeDefined();
    expect(filePreserveSchema.properties.uploadId).toBeDefined();
    expect(filePreserveSchema.properties.fileContentBase64).toBeDefined();
    expect(filePreserve.description.toLowerCase()).toContain('excel');
    const submit = (doc.paths as any)['/api/mcp/tools/submit_approved_document'].post;
    expect(submit.requestBody.content['application/json'].schema.required).toEqual(['payload']);
    expect(submit.requestBody.content['application/json'].schema.properties.payload.type).toBe('string');
    expect(submit.requestBody.content['application/json'].schema.properties.outputFormat.enum).toEqual([
      'pdf', 'docx', 'xlsx', 'pptx', 'txt',
    ]);
    expect(submit.requestBody.content['application/json'].schema.properties.payload.description).toContain('documentContent');
    expect(submit.requestBody.content['application/json'].schema.properties.payload.description).toContain('xlsx');
    expect(submit.requestBody.content['application/json'].schema.properties.payload.description).toContain('NEW_VERSION');
    expect(submit.requestBody.content['application/json'].schema.properties.payload.description).toContain('owner');
    const check = (doc.paths as any)['/api/mcp/tools/check_document_exists'].post;
    expect(check.summary).toContain('newVersionSubmitHints');
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });

  it('keeps ChatGPT Actions operation descriptions within the 300-char limit', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    for (const [path, item] of Object.entries(doc.paths as Record<string, any>)) {
      const description = item?.post?.description;
      if (typeof description === 'string') {
        expect(`${path} description length ${description.length}`).toEqual(`${path} description length ${description.length}`);
        expect(description.length).toBeLessThanOrEqual(300);
      }
      const summary = item?.post?.summary;
      if (typeof summary === 'string') {
        expect(summary.length).toBeLessThanOrEqual(120);
      }
    }
    const payloadDescription = (doc.paths as any)['/api/mcp/tools/submit_approved_document']
      .post.requestBody.content['application/json'].schema.properties.payload.description as string;
    expect(payloadDescription.length).toBeLessThanOrEqual(300);
  });
});
