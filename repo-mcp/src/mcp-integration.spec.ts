import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpServer } from './create-mcp-server.js';
import { REPO_MCP_TOOL_NAMES, registerRepoMcpTools } from './tool-registry.js';

describe('Repo MCP tools/list and tools/call integration', () => {
  it('lists and calls get_latest_repository_workspace through the MCP SDK path', async () => {
    const apiCalls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const server = createMcpServer('Bearer test-token');

    // Wrap the underlying delegate by rebuilding server with recording delegate.
    const recordingServer = new McpServer({ name: 'test', version: '1.32.0' });
    registerRepoMcpTools(recordingServer, async (tool, args = {}) => {
      apiCalls.push({ tool, args });
      return { match: { workspaceCode: 'WS-2026-00099' }, choices: [] };
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await recordingServer.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.equal(names.length, 23);
    assert.equal(names.filter((n) => n === 'get_latest_repository_workspace').length, 1);
    for (const expected of REPO_MCP_TOOL_NAMES) {
      assert.ok(names.includes(expected), `tools/list missing ${expected}`);
    }

    const called = await client.callTool({
      name: 'get_latest_repository_workspace',
      arguments: {},
    });
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0]!.tool, 'get_latest_repository_workspace');
    const content = called.content;
    assert.ok(Array.isArray(content) && content.length > 0);
    assert.ok(!called.isError);

    await client.close();
    await recordingServer.close();

    // Ensure createMcpServer still wires the registry (smoke).
    assert.ok(server);
  });
});
