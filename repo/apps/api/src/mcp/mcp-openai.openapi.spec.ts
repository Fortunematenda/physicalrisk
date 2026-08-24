import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('uses a single payload string for submit to avoid UnrecognizedKwargsError', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    const paths = doc.paths as Record<string, unknown>;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.30.2');
    expect(Object.keys(paths).length).toBeLessThanOrEqual(30);
    expect(paths['/api/mcp/tools/check_document_exists']).toBeDefined();
    expect(paths['/api/mcp/tools/upload_original_docx']).toBeDefined();
    expect(paths['/api/mcp/tools/prepare_automatic_file_import']).toBeDefined();
    expect(paths['/api/mcp/tools/upload_original_file_chunk']).toBeDefined();
    expect(paths['/api/mcp/tools/complete_automatic_file_import']).toBeDefined();
    expect(paths['/api/mcp/tools/finalize_original_file_import']).toBeDefined();
    expect(paths['/api/mcp/tools/search_documents']).toBeDefined();
    expect(paths['/api/mcp/tools/get_document']).toBeDefined();
    expect(paths['/api/mcp/tools/find_workspaces']).toBeDefined();
    expect(paths['/api/mcp/tools/submit_approved_file']).toBeDefined();
    expect(paths['/api/mcp/tools/import_original_file']).toBeDefined();
    expect(paths['/api/mcp/tools/upload_original_xlsx']).toBeUndefined();
    expect(paths['/api/mcp/tools/prepare_approved_document']).toBeUndefined();
    const uploadDocx = (paths['/api/mcp/tools/upload_original_docx'] as any).post;
    expect(uploadDocx.summary.toLowerCase()).toMatch(/primary|binary|file_preserve/);
    const filePreserve = (paths['/api/mcp/tools/submit_approved_file'] as any).post;
    const filePreserveSchema = filePreserve.requestBody.content['application/json'].schema;
    expect(filePreserveSchema.properties.fileUrl).toBeDefined();
    expect(filePreserveSchema.properties.mode).toBeDefined();
    expect(doc.info.description.toLowerCase()).toContain('prepare_automatic_file_import');
    const check = (paths['/api/mcp/tools/check_document_exists'] as any).post;
    expect(check.summary.toLowerCase()).toMatch(/new_version|duplicate/);
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });

  it('keeps ChatGPT Actions operation descriptions within the 300-char limit', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    for (const [path, item] of Object.entries(doc.paths as Record<string, any>)) {
      const description = item?.post?.description;
      if (typeof description === 'string') {
        expect(description.length).toBeLessThanOrEqual(300);
      }
      const summary = item?.post?.summary;
      if (typeof summary === 'string') {
        expect(summary.length).toBeLessThanOrEqual(120);
      }
    }
  });
});
