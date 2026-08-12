import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
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
  UpdateMcpIntegrationDto,
  UpdateMcpIntegrationProjectsDto,
  McpJsonRpcRequestDto,
  McpToolName,
  SubmitApprovedDocumentDto,
} from './mcp.dto';
import { buildChatGptActionsOpenApi, CHATGPT_GPT_INSTRUCTIONS } from './mcp-openai.openapi';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
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
    private readonly config: ConfigService,
    private readonly browserUploads: McpBrowserUploadService,
  ) {}

  /** Public OpenAPI for ChatGPT Custom GPT Actions (no auth). */
  @Public()
  @Get('openai/openapi.json')
  @Header('Cache-Control', 'public, max-age=60')
  chatGptOpenApi() {
    return buildChatGptActionsOpenApi(this.publicBaseUrl());
  }

  /** Setup helpers for the admin UI / GPT builder. */
  @Public()
  @Get('openai/setup')
  chatGptSetup() {
    const baseUrl = this.publicBaseUrl();
    return {
      baseUrl,
      openApiUrl: `${baseUrl}/api/mcp/openai/openapi.json`,
      privacyPolicyUrl: `${baseUrl}/privacy`,
      auth: {
        preferred: 'API Key → Bearer → paste full mcp_… key',
        alternativeHeader: 'X-MCP-API-Key',
      },
      tools: [...MCP_TOOL_NAMES],
      instructions: CHATGPT_GPT_INSTRUCTIONS,
      endpoints: {
        jsonRpc: `${baseUrl}/api/mcp`,
        tools: `${baseUrl}/api/mcp/tools`,
        toolCall: `${baseUrl}/api/mcp/tools/:toolName`,
        mcpAlias: `${baseUrl}/mcp`,
      },
    };
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @Get()
  mcpInfo(@Req() request: McpRequest) {
    const integration = request[MCP_INTEGRATION_KEY];
    const baseUrl = this.publicBaseUrl();
    return {
      protocol: 'physicalrisk-mcp-http/1.0',
      transport: 'json-rpc-over-http',
      integration: integration ? { id: integration.id, name: integration.name } : null,
      tools: this.tools.listToolDefinitions(),
      chatgptActions: {
        openApiUrl: `${baseUrl}/api/mcp/openai/openapi.json`,
        privacyPolicyUrl: `${baseUrl}/privacy`,
      },
      endpoints: {
        jsonRpc: 'POST /api/mcp',
        tools: 'GET /api/mcp/tools',
        toolCall: 'POST /api/mcp/tools/:toolName',
        openApi: 'GET /api/mcp/openai/openapi.json',
      },
    };
  }

  @Public()
  @UseGuards(McpAuthGuard)
  @Get('tools')
  listTools() {
    return { tools: this.tools.listToolDefinitions() };
  }

  /**
   * One-time browser upload page (token is the secret; no MCP key required).
   * Used because Custom GPT Actions cannot transmit PDF bytes.
   */
  @Public()
  @Get('upload/:token')
  uploadPage(@Param('token') token: string, @Res() res: Response) {
    const pending = this.browserUploads.get(token);
    this.browserUploads.assertNotExpired(pending);
    const title = pending.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const project = (pending.projectCode || pending.projectId || '').replace(/</g, '&lt;');
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload Approved Document</title>
  <style>
    body { font-family: "IBM Plex Sans", Segoe UI, sans-serif; margin: 0; background: #eef3f8; color: #0f172a; }
    main { max-width: 560px; margin: 48px auto; padding: 28px; background: #fff; border: 1px solid #d6dee8; }
    h1 { font-size: 1.35rem; margin: 0 0 8px; }
    p { line-height: 1.5; }
    .meta { font-size: 0.92rem; color: #334155; }
    input[type=file] { display: block; margin: 18px 0; }
    button { background: #0b1f33; color: #fff; border: 0; padding: 10px 16px; cursor: pointer; }
    .ok { color: #166534; }
    .err { color: #b91c1c; }
  </style>
</head>
<body>
<main>
  <h1>Upload Approved Document</h1>
  <p class="meta"><strong>${title}</strong><br/>Project: ${project}<br/>Type: ${pending.documentType}</p>
  <p>Select the approved file (PDF, Word, Excel, PowerPoint, or text) and upload. This queues it into the Repository Import Queue.</p>
  <form id="f" method="post" enctype="multipart/form-data">
    <input type="file" name="file" accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,text/markdown" required />
    <button type="submit">Upload to Import Queue</button>
  </form>
  <p id="msg"></p>
</main>
<script>
  const form = document.getElementById('f');
  const msg = document.getElementById('msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Uploading…';
    msg.className = '';
    try {
      const body = new FormData(form);
      const res = await fetch(window.location.pathname, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Upload failed');
      msg.className = 'ok';
      msg.textContent = 'Queued. Import Job ID: ' + (data.result?.importJobId || data.importJobId || 'created');
      form.remove();
    } catch (err) {
      msg.className = 'err';
      msg.textContent = err.message || String(err);
    }
  });
</script>
</body>
</html>`;
    res.status(200).type('html').send(html);
  }

  @Public()
  @Post('upload/:token')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadPageSubmit(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a file to upload (PDF, Word, Excel, PowerPoint, or text)');
    }
    const result = await this.tools.completeBrowserUpload(token, file, request.ip);
    return {
      accepted: true,
      result,
      importJobId: result.importJobId,
      message: 'Document queued in Import Queue',
    };
  }

  /**
   * Legacy multipart submit. ChatGPT cannot attach files here.
   * Without a file → prepareApprovedDocument (returns uploadUrl for browser upload).
   * With a file → queue into Import Queue (non-ChatGPT clients).
   */
  @Public()
  @UseGuards(McpAuthGuard)
  @Post('submit-approved-document')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async submitApprovedDocumentMultipart(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
    @Req() request: McpRequest,
  ) {
    const integration = request[MCP_INTEGRATION_KEY]!;
    this.auth.assertToolAllowed(integration, 'submit_approved_document');

    // ChatGPT Actions often hit this path with JSON/metadata only (no multipart file).
    // With fileUrl → full submit; without → prepare returns uploadUrl.
    if (!file?.buffer?.length) {
      const prepareArgs: Record<string, unknown> = { ...body };
      const result = await this.tools.dispatchTool(
        integration,
        'submit_approved_document',
        prepareArgs,
        request.ip,
      );
      return {
        tool: 'submit_approved_document',
        result,
        message:
          (result as { uploadUrl?: string; importJobId?: string })?.importJobId
            ? 'Document queued in Import Queue'
            : 'No file attached. Open result.uploadUrl in a browser and upload the PDF, or resubmit with fileUrl.',
      };
    }

    const required = {
      title: body.title?.trim(),
      documentType: (body.documentType || body.document_type || '').trim(),
      versionNo: (body.versionNo || body.version || body.version_no || '').trim(),
      approvalStatus: (body.approvalStatus || body.approval_status || 'APPROVED').trim(),
      approvalDate: (body.approvalDate || body.approval_date || '').trim(),
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }

    const payload: SubmitApprovedDocumentDto = {
      projectId: body.projectId || body.project_id || undefined,
      projectCode: body.projectCode || body.project_code || body.project || undefined,
      title: required.title!,
      documentCode: body.documentCode || body.document_code || undefined,
      documentType: required.documentType!,
      description: body.description || undefined,
      owner: body.owner || undefined,
      versionNo: required.versionNo!,
      approvalStatus: required.approvalStatus!,
      approvedBy: (body.approvedBy || body.approved_by || '').trim(),
      approvalDate: required.approvalDate!,
      sectionKey: body.sectionKey || body.section_key || undefined,
      module: body.module || body.repositoryModule || body.repository_module || undefined,
      metadataJson: body.metadataJson || undefined,
      relationshipsJson: body.relationshipsJson || undefined,
      mode: body.mode === 'NEW_VERSION' ? 'NEW_VERSION' : body.mode === 'NEW' ? 'NEW' : undefined,
      existingDocumentId: body.existingDocumentId || undefined,
      fileName: body.fileName || body.file_name || file.originalname,
      fileContentBase64: file.buffer.toString('base64'),
      mimeType: body.mimeType || body.mime_type || file.mimetype,
    };

    const result = await this.tools.submitApprovedDocument(integration, payload, request.ip);
    return { tool: 'submit_approved_document', result };
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
    const args = this.withIdempotencyKey(this.normalizeToolArgs(body), request);
    const result = await this.tools.dispatchTool(
      integration,
      toolName,
      args,
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
      const args = this.withIdempotencyKey(
        this.extractToolArguments(body.method, body.params),
        request,
      );
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

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'physicalrisk-mcp',
      tools: MCP_TOOL_NAMES.length,
      chatgptOpenApi: '/api/mcp/openai/openapi.json',
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

  @Patch('integrations/:id/projects')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  updateIntegrationProjects(
    @Param('id') id: string,
    @Body() body: UpdateMcpIntegrationProjectsDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.updateAllowedProjects(id, body.allowedProjectIds, user?.id);
  }

  @Patch('integrations/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  updateIntegration(
    @Param('id') id: string,
    @Body() body: UpdateMcpIntegrationDto,
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.auth.updateIntegration(id, body, user?.id);
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
    return this.auth.deleteIntegration(id, user?.id);
  }

  private publicBaseUrl(): string {
    const configured =
      this.config.get<string>('REPO_WEB_URL')
      || this.config.get<string>('PUBLIC_WEB_URL')
      || this.config.get<string>('CORS_ORIGIN')
      || 'https://repo.physicalrisk.com';
    const first = configured.split(',')[0]?.trim() || 'https://repo.physicalrisk.com';
    return first.replace(/\/+$/, '');
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
        ? this.normalizeToolArgs(args as Record<string, unknown>)
        : {};
    }
    return this.normalizeToolArgs(params ?? {});
  }

  /** Drop ChatGPT placeholder fields like `unused` from empty-body tools. */
  private normalizeToolArgs(body: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    const { unused: _unused, ...rest } = body;
    return rest;
  }

  /** Prefer body idempotencyKey; fall back to Idempotency-Key header. */
  private withIdempotencyKey(
    args: Record<string, unknown>,
    request: McpRequest,
  ): Record<string, unknown> {
    if (typeof args.idempotencyKey === 'string' && args.idempotencyKey.trim()) return args;
    const header = request.headers?.['idempotency-key'];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === 'string' && value.trim()) {
      return { ...args, idempotencyKey: value.trim() };
    }
    return args;
  }
}
