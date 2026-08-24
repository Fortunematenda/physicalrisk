import { buildChatGptActionsOpenApi } from './mcp-openai.openapi';

describe('buildChatGptActionsOpenApi', () => {
  it('prioritises binary FILE_PRESERVE ops within the 30-operation limit', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    const paths = doc.paths as Record<string, unknown>;
    const keys = Object.keys(paths);
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.31.1');
    expect(keys.length).toBeLessThanOrEqual(30);
    expect(keys.length).toBeLessThanOrEqual(20);
    for (const name of [
      'check_document_exists',
      'upload_original_docx',
      'prepare_automatic_file_import',
      'upload_original_file_chunk',
      'complete_automatic_file_import',
      'finalize_original_file_import',
      'import_original_file',
    ]) {
      expect(paths[`/api/mcp/tools/${name}`]).toBeDefined();
    }
    expect(paths['/api/mcp/tools/submit_approved_document']).toBeUndefined();
    expect(paths['/api/mcp/tools/submit_approved_content']).toBeUndefined();
    expect(doc.info.description.toLowerCase()).toContain('prepare_automatic_file_import');
    expect(Object.keys((doc.components as any).securitySchemes)).toEqual(['McpBearer']);
  });

  it('keeps ChatGPT Actions operation descriptions within the 300-char limit', () => {
    const doc = buildChatGptActionsOpenApi('https://repo.physicalrisk.com/');
    for (const [, item] of Object.entries(doc.paths as Record<string, any>)) {
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
