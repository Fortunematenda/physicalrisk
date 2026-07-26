import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { McpIntegration } from '../database/entities';
import { CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UserRole } from '../database/entities';
import { MCP_INTEGRATION_KEY, McpAuthGuard } from './mcp-auth.guard';
import { McpAuthService } from './mcp-auth.service';
import {
  CreateMcpIntegrationDto,
  MCP_TOOL_NAMES,
  McpJsonRpcRequestDto,
  McpToolName,
} from './mcp.dto';
import { McpToolsService } from './mcp-tools.service';

type McpRequest = Request & { [MCP_INTEGRATION_KEY]?: McpIntegration };

/**
 * MCP HTTP transport lives under `/api/mcp` (global prefix `api`).
 * Configure nginx to proxy `/mcp` → upstream `/api/mcp` when exposing externally.
 */
@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(
    private readonly auth: McpAuthService,
    private readonly tools: McpToolsService,
  ) {}

  @Public()
  @UseGuards(McpAuthGuard)
  @Get()
  mcpInfo(@Req() request: McpRequest) {
    const integration = request[MCP_INTEGRATION_KEY];
    return {
      protocol: 'physicalrisk-mcp-http/1.0',
      transport: 'json-rpc-over-http',
      integration: integration ? { id: integration.id, name: integration.name } : null,
      tools: this.tools.listToolDefinitions(),
      endpoints: {
        jsonRpc: 'POST /api/mcp',
        tools: 'GET /api/mcp/tools',
        toolCall: 'POST /api/mcp/tools/:toolName',
      },
    };
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @Get('tools')
  listTools() {
    return { tools: this.tools.listToolDefinitions() };
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @Post('tools/:toolName')
  async callToolDirect(
    @Param('toolName') toolName: string,
    @Body() body: Record<string, unknown>,
    @Req() request: McpRequest,
  ) {
    this.assertKnownTool(toolName);
    const integration = request[MCP_INTEGRATION_KEY]!;
    const result = await this.tools.dispatchTool(
      integration,
      toolName,
      body ?? {},
      request.ip,
    );
    return { tool: toolName, result };
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @Post()
  async jsonRpc(@Body() body: McpJsonRpcRequestDto, @Req() request: McpRequest) {
    const integration = request[MCP_INTEGRATION_KEY]!;
    const id = body.id ?? null;

    if (body.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: this.tools.listToolDefinitions() },
      };
    }

    const toolName = this.resolveToolName(body.method, body.params);
    this.assertKnownTool(toolName);

    try {
      const args = this.extractToolArguments(body.method, body.params);
      const result = await this.tools.dispatchTool(integration, toolName, args, request.ip);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP tool call failed';
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message },
      };
    }
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'physicalrisk-mcp',
      tools: MCP_TOOL_NAMES.length,
    };
  }

  @Get('integrations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async listIntegrations() {
    const rows = await this.auth.listIntegrations();
    return rows.map((row) => this.auth.toView(row));
  }

  @Post('integrations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  createIntegration(
    @Body() body: CreateMcpIntegrationDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.createIntegration(body, user?.id);
  }

  @Post('integrations/:id/rotate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  rotateIntegration(
    @Param('id') id: string,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.rotateIntegration(id, user?.id);
  }

  @Post('integrations/:id/disable')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  disableIntegration(
    @Param('id') id: string,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.disableIntegration(id, user?.id);
  }

  @Delete('integrations/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  deleteIntegration(
    @Param('id') id: string,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.disableIntegration(id, user?.id);
  }

  private assertKnownTool(toolName: string): asserts toolName is McpToolName {
    if (!MCP_TOOL_NAMES.includes(toolName as McpToolName)) {
      throw new BadRequestException(`Unknown MCP tool: ${toolName}`);
    }
  }

  private resolveToolName(method: string, params?: Record<string, unknown>): McpToolName {
    if (method === 'tools/call') {
      const name = String(params?.name ?? '').trim();
      this.assertKnownTool(name);
      return name;
    }
    this.assertKnownTool(method);
    return method;
  }

  private extractToolArguments(method: string, params?: Record<string, unknown>): Record<string, unknown> {
    if (method === 'tools/call') {
      const args = params?.arguments;
      return args && typeof args === 'object' && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {};
    }
    return params ?? {};
  }
}
