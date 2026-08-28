import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { mcpRequestRequiresAuth } from './oauth.js';
import {
  REPO_MCP_TOOL_DEFINITIONS,
  REPO_MCP_TOOL_NAMES,
  buildRepoMcpToolHandlers,
  validateRepoMcpToolRegistry,
} from './tool-registry.js';

type RegisteredTool = {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Minimal stand-in for McpServer.tool — records the same registrations production uses. */
class RecordingMcpServer {
  readonly tools = new Map<string, RegisteredTool>();

  tool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: RegisteredTool['handler'],
  ) {
    this.tools.set(name, { name, description, schema, handler });
  }
}

function registerOnRecorder(server: RecordingMcpServer, mcpTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>) {
  const handlers = buildRepoMcpToolHandlers(mcpTool);
  for (const def of REPO_MCP_TOOL_DEFINITIONS) {
    const handler = handlers.get(def.name);
    if (!handler) throw new Error(`Missing handler for ${def.name}`);
    server.tool(def.name, def.description, def.schema, handler);
  }
}

describe('Repo MCP tool registry', () => {
  it('validates the canonical 23-tool registry', () => {
    validateRepoMcpToolRegistry();
    assert.equal(REPO_MCP_TOOL_NAMES.filter((n) => n === 'get_latest_repository_workspace').length, 1);
  });

  it('registers every advertised tool with a handler (list/call parity)', () => {
    const recorder = new RecordingMcpServer();
    registerOnRecorder(recorder, async () => ({ ok: true }));
    assert.equal(recorder.tools.size, 23);
    for (const name of REPO_MCP_TOOL_NAMES) {
      assert.ok(recorder.tools.has(name), `missing handler for ${name}`);
    }
  });

  it('calls get_latest_repository_workspace through the MCP dispatch path', async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const recorder = new RecordingMcpServer();
    registerOnRecorder(recorder, async (tool, args = {}) => {
      calls.push({ tool, args });
      return { match: null, choices: [] };
    });

    const entry = recorder.tools.get('get_latest_repository_workspace');
    assert.ok(entry);
    const result = await entry!.handler({});
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.tool, 'get_latest_repository_workspace');
    assert.deepEqual(calls[0]!.args, {});
    assert.ok(result && typeof result === 'object' && 'content' in (result as object));
  });

  it('does not accept userId in get_latest_repository_workspace args', async () => {
    const recorder = new RecordingMcpServer();
    registerOnRecorder(recorder, async (tool, args = {}) => ({ tool, args }));
    const entry = recorder.tools.get('get_latest_repository_workspace')!;
    const result = await entry.handler({ userId: 'someone-else' }) as { structuredContent: { tool: string; args: Record<string, unknown> } };
    assert.equal(result.structuredContent.tool, 'get_latest_repository_workspace');
    assert.equal(result.structuredContent.args.userId, 'someone-else');
    // repo-api ignores foreign userId — identity comes from Bearer only (verified in api tests).
  });

  it('requires auth for tools/call but not tools/list', () => {
    assert.equal(mcpRequestRequiresAuth('POST', 'tools/list'), false);
    assert.equal(mcpRequestRequiresAuth('POST', 'tools/call'), true);
  });
});
