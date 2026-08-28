import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prepareUploadSchema, searchDocsSchema, submitFileSchema } from './schemas.js';
import { toolResult } from './tool-result.js';

export type McpApiDelegate = (apiTool: string, args?: Record<string, unknown>) => Promise<unknown>;

export type RepoMcpToolDefinition = {
  /** Canonical MCP tool name exposed to ChatGPT (tools/list + tools/call). */
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  /** repo-api `/mcp/tools/:name` when different from the public MCP name. */
  apiTool?: string;
  buildApiArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
};

function prepareUploadBody(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args.payload === 'string') return { payload: args.payload };
  return {
    projectCode: args.projectCode,
    module: args.module,
    documentType: args.documentType,
    title: args.title,
    documentCode: args.documentCode,
    mode: args.mode,
    versionNo: args.versionNo,
    fileName: args.fileName,
    mimeType: args.mimeType,
    workspaceCode: args.workspaceCode,
    owner: args.owner,
    description: args.description,
    existingDocumentId: args.existingDocumentId,
  };
}

function submitFileBody(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args.payload === 'string') return { payload: args.payload };
  return {
    projectCode: args.projectCode,
    module: args.module,
    documentType: args.documentType,
    title: args.title,
    documentCode: args.documentCode,
    mode: args.mode,
    versionNo: args.versionNo,
    fileName: args.fileName,
    mimeType: args.mimeType,
    fileContentBase64: args.fileContentBase64,
    fileUrl: args.fileUrl,
    uploadId: args.uploadId,
    sourceSha256: args.sourceSha256,
    workspaceCode: args.workspaceCode,
    owner: args.owner,
    description: args.description,
  };
}

/**
 * Canonical Repo MCP tool registry — single source for tools/list and tools/call.
 * Order: FILE_PRESERVE first, then discovery, then workspace tools (23 total).
 */
export const REPO_MCP_TOOL_DEFINITIONS: readonly RepoMcpToolDefinition[] = [
  {
    name: 'check_document_exists',
    description:
      'Before import: check if a document with this title/code already exists. '
      + 'If exists, use NEW_VERSION with that documentCode — do NOT create a duplicate code.',
    schema: {
      projectCode: z.string().optional().describe('e.g. MOSS'),
      projectId: z.string().optional(),
      title: z.string().optional(),
      documentCode: z.string().optional(),
      fileName: z.string().optional(),
    },
  },
  {
    name: 'upload_original_docx',
    description:
      'PRIMARY binary original-file upload (FILE_PRESERVE) for DOCX/XLSX/PDF/PPTX. '
      + 'Returns uploadId + uploadUrl (PUT exact bytes) then finalize_original_file_import. '
      + 'NEW_VERSION: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). NOT Markdown→PDF.',
    schema: prepareUploadSchema,
    apiTool: 'prepare_original_file_import',
    buildApiArgs: prepareUploadBody,
  },
  {
    name: 'prepare_automatic_file_import',
    description:
      'Start automatic resumable chunked FILE_PRESERVE. Returns uploadId+uploadToken+acceptedChunkSize. '
      + 'Then call upload_original_file_chunk repeatedly without waiting for another user message. Never Markdown.',
    schema: prepareUploadSchema,
  },
  {
    name: 'upload_original_file_chunk',
    description:
      'Upload one exact binary chunk (base64). Validates chunkSha256. Continue automatically until complete_automatic_file_import.',
    schema: {
      uploadId: z.string(),
      uploadToken: z.string(),
      chunkIndex: z.number().int().min(0),
      encodedContent: z.string().optional(),
      chunkBase64: z.string().optional(),
      chunkSha256: z.string(),
      rawByteLength: z.number().int().min(1),
    },
  },
  {
    name: 'complete_automatic_file_import',
    description: 'Assemble/validate OOXML+SHA-256 then queue FILE_PRESERVE. Session create is not success.',
    schema: {
      uploadId: z.string(),
      uploadToken: z.string(),
      expectedSha256: z.string().optional(),
      expectedFileSize: z.number().int().optional(),
      ...prepareUploadSchema,
    },
  },
  {
    name: 'finalize_original_file_import',
    description:
      'Verify stored original file size and SHA-256 after staged PUT or automatic import. '
      + 'Returns UPLOAD_PENDING, VERIFIED, VERIFICATION_FAILED, or IMPORTED.',
    schema: {
      uploadId: z.string(),
      uploadToken: z.string().optional(),
    },
  },
  {
    name: 'import_original_file',
    description: 'Zero-click FILE_PRESERVE when a public HTTPS fileUrl exists. Never convert to Markdown or PDF.',
    schema: {
      ...submitFileSchema,
      attachmentReference: z.string().optional(),
      expectedSha256: z.string().optional(),
    },
    buildApiArgs: (args) => (
      typeof args.payload === 'string'
        ? {
            payload: args.payload,
            attachmentReference: args.attachmentReference,
            expectedSha256: args.expectedSha256,
          }
        : { ...args }
    ),
  },
  {
    name: 'submit_approved_file',
    description:
      'FILE_PRESERVE import via fileUrl, fileContentBase64, or uploadId. Prefer automatic chunk path for attachments.',
    schema: submitFileSchema,
    buildApiArgs: submitFileBody,
  },
  {
    name: 'list_repository_projects',
    description: 'List repository projects. Use this when choosing a projectCode (e.g. MCRD).',
    schema: {},
  },
  {
    name: 'list_repository_modules',
    description: 'List modules/sections for a project. Use projectCode from list_repository_projects.',
    schema: {
      projectCode: z.string().optional().describe('Project code e.g. MCRD'),
      projectId: z.string().optional().describe('Project UUID if known'),
    },
  },
  {
    name: 'list_document_types',
    description: 'List active document types (e.g. Article).',
    schema: {},
  },
  {
    name: 'resolve_import_targets',
    description: 'Map project/module/documentType labels to IDs before import.',
    schema: {
      project: z.string().describe('Project code or name e.g. MOSS'),
      module: z.string().optional(),
      documentType: z.string().optional(),
    },
  },
  {
    name: 'search_documents',
    description: 'List/search Master Document Index. Use for how many / list all / what was imported.',
    schema: searchDocsSchema,
  },
  {
    name: 'get_document',
    description: 'Get one document by UUID or documentCode (e.g. MOSS-GS-003)',
    schema: {
      documentId: z.string().optional(),
      documentCode: z.string().optional().describe('e.g. MOSS-GS-003'),
    },
  },
  {
    name: 'get_import_status',
    description: 'Get import job status after FILE_PRESERVE queue',
    schema: { importJobId: z.string() },
  },
  {
    name: 'create_repository_workspace',
    description: 'Create a Repository Workspace. Returns workspaceCode WS-YYYY-##### to resume later.',
    schema: {
      name: z.string(),
      projectCode: z.string().optional().describe('Prefer this — e.g. MCRD'),
      projectId: z.string().optional(),
    },
    apiTool: 'create_workspace',
  },
  {
    name: 'get_repository_workspace',
    description: 'Get workspace by code (WS-YYYY-#####)',
    schema: { workspaceCode: z.string() },
    apiTool: 'get_workspace',
  },
  {
    name: 'get_latest_repository_workspace',
    description:
      'Latest pending/in-progress workspace for the signed-in user — use when resuming without a code. '
      + 'Never pass another user id; identity comes from OAuth.',
    schema: {},
    apiTool: 'get_latest_repository_workspace',
  },
  {
    name: 'get_workspace_summary',
    description: 'Workspace progress + documents',
    schema: { workspaceCode: z.string() },
  },
  {
    name: 'list_workspace_documents',
    description: 'List documents attached to a workspace',
    schema: { workspaceCode: z.string() },
  },
  {
    name: 'attach_document_to_workspace',
    description: 'Attach an already-imported repository document to a workspace',
    schema: {
      workspaceCode: z.string().describe('e.g. WS-2026-00004'),
      documentCode: z.string().optional().describe('e.g. MOSS-GS-003'),
      documentId: z.string().optional(),
      importJobId: z.string().optional(),
    },
  },
  {
    name: 'submit_repository_workspace',
    description: 'Submit workspace import',
    schema: { workspaceCode: z.string() },
    apiTool: 'submit_workspace',
  },
  {
    name: 'resume_repository_workspace',
    description: 'Resume / continue a paused workspace',
    schema: { workspaceCode: z.string() },
    apiTool: 'resume_workspace',
  },
] as const;

export const REPO_MCP_TOOL_NAMES = REPO_MCP_TOOL_DEFINITIONS.map((tool) => tool.name);

export type RegisteredMcpTool = {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<ReturnType<typeof toolResult>>;
};

/** Build handler map — used by registerRepoMcpTools and integration tests. */
export function buildRepoMcpToolHandlers(mcpTool: McpApiDelegate): Map<string, RegisteredMcpTool['handler']> {
  const handlers = new Map<string, RegisteredMcpTool['handler']>();
  for (const def of REPO_MCP_TOOL_DEFINITIONS) {
    handlers.set(def.name, async (args) => {
      const apiName = def.apiTool ?? def.name;
      const body = def.buildApiArgs ? def.buildApiArgs(args) : args;
      return toolResult(await mcpTool(apiName, body));
    });
  }
  return handlers;
}

/**
 * Register every canonical tool on the MCP server from the same registry
 * so tools/list and tools/call can never diverge.
 */
export function registerRepoMcpTools(server: McpServer, mcpTool: McpApiDelegate): void {
  const handlers = buildRepoMcpToolHandlers(mcpTool);
  for (const def of REPO_MCP_TOOL_DEFINITIONS) {
    const handler = handlers.get(def.name);
    if (!handler) {
      throw new Error(`Missing handler for advertised MCP tool: ${def.name}`);
    }
    server.tool(def.name, def.description, def.schema, handler);
  }
}

export function validateRepoMcpToolRegistry(): void {
  const names = REPO_MCP_TOOL_NAMES;
  const unique = new Set(names);
  if (unique.size !== names.length) {
    const dupes = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate MCP tool names: ${dupes.join(', ')}`);
  }
  if (names.length !== 23) {
    throw new Error(`Expected 23 Repo MCP tools, found ${names.length}`);
  }
  if (!names.includes('get_latest_repository_workspace')) {
    throw new Error('get_latest_repository_workspace must be registered');
  }
}
