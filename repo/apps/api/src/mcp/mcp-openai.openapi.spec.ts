import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('uses a single payload string for submit to avoid UnrecognizedKwargsError', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.30.1');
    expect((doc.paths as any)['/api/mcp/tools/search_documents']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/get_document']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/find_workspaces']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_file']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/submit_approved_content']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/prepare_approved_document']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/upload_original_docx']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/upload_original_xlsx']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/upload_original_pdf']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/upload_original_pptx']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/import_original_file']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/prepare_original_file_import']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/finalize_original_file_import']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/prepare_automatic_file_import']).toBeDefined();
    expect((doc.paths as any)['/api/mcp/tools/inspect_attachment_capability']).toBeDefined();
    const uploadDocx = (doc.paths as any)['/api/mcp/tools/upload_original_docx'].post;
    expect(uploadDocx.summary.toLowerCase()).toMatch(/primary|binary|file_preserve/);
    expect(uploadDocx.description.toLowerCase()).toMatch(/available|never markdown/);
    const prepare = (doc.paths as any)['/api/mcp/tools/prepare_approved_document'].post;
    expect(prepare.summary.toLowerCase()).toMatch(/upload_original_docx|file_preserve|alias/);
    expect(prepare.description.toLowerCase()).toContain('documentcontent');
    const filePreserve = (doc.paths as any)['/api/mcp/tools/submit_approved_file'].post;
    const filePreserveSchema = filePreserve.requestBody.content['application/json'].schema;
    expect(filePreserveSchema.properties.payload.description).toContain('fileContentBase64');
    expect(filePreserveSchema.properties.fileUrl).toBeDefined();
    expect(filePreserveSchema.properties.uploadId).toBeDefined();
    expect(filePreserveSchema.properties.fileContentBase64).toBeDefined();
    expect(filePreserveSchema.properties.mode).toBeDefined();
    expect(filePreserveSchema.properties.documentCode).toBeDefined();
    const prepareSchema = prepare.requestBody.content['application/json'].schema;
    expect(prepareSchema.properties.mode).toBeDefined();
    expect(prepareSchema.properties.documentCode).toBeDefined();
    expect(prepareSchema.properties.payload.description).toContain('NEW_VERSION');
    expect(prepareSchema.properties.payload.description).toMatch(/No documentContent|never documentContent/i);
    expect(filePreserve.description.toLowerCase()).toMatch(/file|preserve|url/);
    expect(doc.info.description.toLowerCase()).toContain('docx');
    expect(doc.info.description.toLowerCase()).toMatch(/file_preserve|supported/);
    const submit = (doc.paths as any)['/api/mcp/tools/submit_approved_document'].post;
    expect(submit.summary.toLowerCase()).toMatch(/generated text|not binary/);
    expect(submit.description.toLowerCase()).toMatch(/import_original_file|prepare_original_file_import/);
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
