/**
 * OpenAPI for ChatGPT Custom GPT Actions.
 *
 * UnrecognizedKwargsError workaround: submit/prepare take a single string field `payload`
 * (JSON object as string) so the model cannot invent extra kwargs.
 */
export function buildChatGptActionsOpenApi(publicBaseUrl: string) {
  const baseUrl = publicBaseUrl.replace(/\/+$/, '') || 'https://repo.physicalrisk.com';

  const ok = {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            result: {
              type: 'object',
              properties: {
                accepted: { type: 'boolean' },
                ready: { type: 'boolean' },
                uploadUrl: { type: 'string' },
                importJobId: { type: 'string' },
                status: { type: 'string' },
                exists: { type: 'boolean' },
                instructions: { type: 'string' },
                message: { type: 'string' },
                total: { type: 'integer' },
                count: { type: 'integer' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  };
  const err = {
    description: 'Error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
      },
    },
  };
  const responses = { '200': ok, '400': err, '401': err, '403': err };
  const security = [{ McpBearer: [] }];

  const emptyBody = {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', properties: { unused: { type: 'boolean' } } },
      },
    },
  };

  const workspaceCodeBody = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['workspaceCode'],
          properties: { workspaceCode: { type: 'string', description: 'e.g. WS-2026-00003' } },
        },
      },
    },
  };

  const payloadSchema = {
    type: 'object',
    required: ['payload'],
    properties: {
      payload: {
        type: 'string',
        description:
          'JSON: projectCode, module, documentType, title, documentContent; optional owner, description, '
          + 'approvedBy, fileName, outputFormat (pdf|docx|xlsx|pptx|txt). '
          + 'Spreadsheet/.xlsx → outputFormat=xlsx + fileName=*.xlsx (never PDF). '
          + 'Revisions: mode=NEW_VERSION + existingDocumentId/documentCode.',
      },
      outputFormat: {
        type: 'string',
        enum: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'],
        description:
          'Set xlsx when chat has Spreadsheet/.xlsx. Also include inside payload.',
      },
      fileName: {
        type: 'string',
        description: 'e.g. Plan.xlsx / Report.docx / Deck.pptx / Notes.txt',
      },
    },
  };

  const post = (
    operationId: string,
    summary: string,
    requestBody: unknown,
    description?: string,
  ) => ({
    post: {
      operationId,
      summary,
      ...(description ? { description } : {}),
      security,
      requestBody,
      responses,
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Physical Risk Repo MCP',
      description:
        'Same-chat: research → generate → approve → submit with documentContent. '
        + 'Supports NEW documents and NEW_VERSION revisions of existing documents '
        + '(mode=NEW_VERSION + existingDocumentId/documentCode; server bumps Rev). '
        + 'search_documents lists the Master Document Index. '
        + 'Repo converts Markdown from fileName/outputFormat: Excel→xlsx, Word→docx, PowerPoint→pptx, text→txt, otherwise PDF. '
        + 'writes Document Information, applies routing, '
        + 'imports into the folder, and updates the Master Document Index. '
        + `Privacy: ${baseUrl}/privacy`,
      version: '1.21.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/tools/list_repository_projects': post(
        'list_repository_projects',
        'List repository projects',
        emptyBody,
      ),
      '/api/mcp/tools/list_document_types': post(
        'list_document_types',
        'List document types',
        emptyBody,
      ),
      '/api/mcp/tools/list_repository_modules': post(
        'list_repository_modules',
        'List project modules',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  projectCode: { type: 'string' },
                  projectId: { type: 'string' },
                },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/resolve_import_targets': post(
        'resolve_import_targets',
        'Resolve project/module/type names to IDs',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project'],
                properties: {
                  project: { type: 'string', description: 'Project code or name (e.g. MCRD)' },
                  module: { type: 'string', description: 'Folder/module name' },
                  documentType: { type: 'string' },
                },
              },
            },
          },
        },
        'Map human labels to projectId/sectionKey/documentType before submit.',
      ),
      '/api/mcp/tools/search_documents': post(
        'search_documents',
        'List/search Master Document Index',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  search: { type: 'string', description: 'Title, code, or type text' },
                  projectCode: { type: 'string', description: 'e.g. MCRD' },
                  projectId: { type: 'string' },
                  status: { type: 'string' },
                  limit: { type: 'integer', minimum: 1, maximum: 200 },
                },
              },
            },
          },
        },
        'Use for how many / list all / what was imported. Returns compact index rows.',
      ),
      '/api/mcp/tools/get_document': post(
        'get_document',
        'Get one document by id or code',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  documentId: { type: 'string' },
                  documentCode: { type: 'string', description: 'e.g. MCRD-AS1-012' },
                },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/check_document_exists': post(
        'check_document_exists',
        'Check duplicates; returns newVersionSubmitHints',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  projectCode: { type: 'string' },
                  title: { type: 'string' },
                  documentCode: { type: 'string' },
                  fileName: { type: 'string' },
                },
              },
            },
          },
        },
        'If exists=true, copy matches[0].newVersionSubmitHints into submit payload for NEW_VERSION.',
      ),
      '/api/mcp/tools/submit_approved_document': post(
        'submit_approved_document',
        'Submit approved document (new or next version)',
        {
          required: true,
          content: { 'application/json': { schema: payloadSchema } },
        },
        'Pass payload. Set top-level outputFormat when not PDF (xlsx/docx/pptx/txt). '
          + 'Spreadsheet/.xlsx → outputFormat=xlsx (never PDF). '
          + 'Put Markdown in documentContent. NEW_VERSION: mode + existingDocumentId/documentCode.',
      ),
      '/api/mcp/tools/prepare_approved_document': post(
        'prepare_approved_document',
        'Prepare or submit (alias)',
        {
          required: true,
          content: { 'application/json': { schema: payloadSchema } },
        },
        'Same as submit_approved_document. Set outputFormat=xlsx for spreadsheets.',
      ),
      '/api/mcp/tools/get_import_status': post(
        'get_import_status',
        'Get import job status',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['importJobId'],
                properties: { importJobId: { type: 'string' } },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/create_workspace': post(
        'create_workspace',
        'Create Repository Workspace (WS-YYYY-#####)',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'projectCode'],
                properties: {
                  name: { type: 'string' },
                  projectCode: {
                    type: 'string',
                    description: 'Project code from list_repository_projects (e.g. MCRD)',
                  },
                  projectId: { type: 'string' },
                },
              },
            },
          },
        },
        'Returns workspaceCode to resume from another chat. Prefer projectCode (MCRD/MOSS/PROR).',
      ),
      '/api/mcp/tools/get_workspace': post('get_workspace', 'Get workspace by code', workspaceCodeBody),
      '/api/mcp/tools/find_workspaces': post(
        'find_workspaces',
        'Find workspaces for current user',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  workspaceCode: { type: 'string' },
                  name: { type: 'string' },
                  projectCode: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
      ),
      '/api/mcp/tools/get_latest_pending_workspace': post(
        'get_latest_pending_workspace',
        'Latest pending workspace for current user',
        {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: {} } } },
        },
      ),
      '/api/mcp/tools/get_workspace_summary': post(
        'get_workspace_summary',
        'Workspace summary with documents',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/list_workspace_documents': post(
        'list_workspace_documents',
        'List documents in a workspace',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/resume_workspace': post(
        'resume_workspace',
        'Resume workspace by code',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/validate_workspace': post(
        'validate_workspace',
        'Validate workspace before submit',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/submit_workspace': post(
        'submit_workspace',
        'Submit ready workspace for import',
        workspaceCodeBody,
      ),
      '/api/mcp/tools/attach_document_to_workspace': post(
        'attach_document_to_workspace',
        'Attach imported document to workspace',
        {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workspaceCode'],
                properties: {
                  workspaceCode: { type: 'string' },
                  documentCode: { type: 'string', description: 'e.g. MCRD-AS1-012' },
                  documentId: { type: 'string' },
                  importJobId: { type: 'string' },
                },
              },
            },
          },
        },
      ),
    },
    components: {
      schemas: {
        Placeholder: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
      securitySchemes: {
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Full mcp_… API key as Bearer token',
        },
      },
    },
  };
}

export const CHATGPT_GPT_INSTRUCTIONS = `You are the Physical Risk Repository assistant.

FIELD MAPPING (never swap — be accurate and consistent)
- projectCode = Repository Project (e.g. MOSS). From list_repository_projects.
- module = Repository Module / folder (e.g. Articles, Research Library). From list_repository_modules. NOT document type.
- documentType = Document classification (e.g. Article, Technical Specification). From list_document_types. NOT the folder name.
- Correct pair example: module=Articles + documentType=Article.
- Wrong: documentType=Articles (that is a folder) or module=Article (that is a type).

════════════════════════════════════
LIST / SEARCH / COUNT (mandatory)
════════════════════════════════════
When the user asks how many documents, list documents, what was imported, imported today, or show the index:
1) Call search_documents NOW (optional projectCode / search / limit).
2) Report total + a compact table: documentCode, title, projectCode, module, currentVersion, updatedAt.
3) For one document detail, call get_document with documentCode (preferred) or documentId.
Never invent or omit documents — only report tool results.
Never say the connector cannot list documents.

════════════════════════════════════
APPROVAL / IMPORT FLOW (mandatory)
════════════════════════════════════
When the user says any of: approved / I approve / please import / import this / submit / import to my repo:

STEP A — Load live options (call tools NOW, before asking anything)
1) list_repository_projects
2) list_document_types
3) If the user already named a project, list_repository_modules for that projectCode; otherwise wait until they pick a project, then call list_repository_modules.

STEP B — Selection menus (ChatGPT cannot render real dropdowns; numbered lists are required so the user can tap/reply with a number)

Ask ONE menu at a time (project → then document type → then module). Never dump all three in one message unless the user already gave some answers.

Format EVERY option with an explicit Arabic number on its own line (mandatory — never a bare bullet list):

Select project — reply with a number only:
1. MOSS — MOSS
2. PROR — Operating Repository
3. …

After they pick a project number, call list_repository_modules, then:

Select document type — reply with a number only:
1. Article
2. Technical Specification
3. …

Then:

Select module (folder) — reply with a number only:
1. Articles
2. Research Library
3. …

Rules for menus:
- Use ONLY values returned by the tools (never invent projects/types/modules).
- Every row MUST start with "1." "2." "3." etc. Unnumbered lists are forbidden.
- If the user already stated any choice clearly, skip that menu.
- End each menu with exactly: "Reply with the number only (e.g. 2)."
- Prefer short messages so ChatGPT can offer suggested-reply chips when available.

════════════════════════════════════
OUTPUT FORMAT (critical — read every time)
════════════════════════════════════
ChatGPT may show a downloadable .xlsx in the chat UI. That file is NOT sent to Repo automatically.
You MUST set the format explicitly on submit_approved_document:
- Top-level Action field outputFormat = xlsx|docx|pptx|txt|pdf
- AND inside payload: "outputFormat":"…" and "fileName":"….xlsx" (or .docx/.pptx/.txt/.pdf)

Rules:
- If you created/showed a Spreadsheet or .xlsx/.xls, or the user asked for Excel: outputFormat=xlsx, fileName=*.xlsx. NEVER PDF.
- If Word / .docx: outputFormat=docx. NEVER PDF.
- If PowerPoint / .pptx: outputFormat=pptx. NEVER PDF.
- If plain text / .txt: outputFormat=txt. NEVER PDF.
- PDF only when the user asked for PDF or did not ask for Office/TXT.
- NEVER send mimeType=application/pdf when using xlsx/docx/pptx/txt.
- On success, tell the user the stored fileName extension (must match the requested format).

STEP C — Auto fields (NEVER ask the user)
- approvalDate = today (server default if omitted)
- Output format: follow OUTPUT FORMAT rules above (default PDF only when no Office/TXT was requested)
- versionNo = Rev 1.0 for NEW (or server bump for NEW_VERSION)
- approvalStatus = APPROVED
- approvedBy = the ChatGPT user's real name if they told you it in this chat; otherwise OMIT approvedBy (the server fills it from the MCP key owner's repo profile)
- owner = same as approvedBy when you set it; otherwise omit
- description = 1–2 sentence summary YOU write from the document
- documentContent = the FULL Markdown you already generated in THIS chat (never ask the user to paste it again)

STEP D — Import immediately after selections are complete
As soon as project + documentType + module are known:
1) Optional: check_document_exists (title or code) — if exists and user wants another version, use matches[0].newVersionSubmitHints (mode=NEW_VERSION).
2) Call submit_approved_document ONCE with:
   - top-level outputFormat when not PDF (especially xlsx for spreadsheets)
   - payload JSON string containing at least:
     projectCode, module, documentType, title, documentContent, description
     and when not PDF: fileName + outputFormat (same as top-level)
   Include owner and approvedBy only when you know the user's real name.
3) Do NOT ask for date, MIME, filename, version, or content again.
4) On success report: imported, documentCode, sectionName, importJobId, result.fileName (must show .xlsx/.docx/.pptx/.txt/.pdf), result.message.
5) Only mention Import Queue if needsReview=true.

FORBIDDEN
- Asking for Approval date, MIME type, Original filename, Version, Approved by, Owner, or "the document itself" after you already wrote it in chat.
- Submitting before project + documentType + module are selected (unless the user already provided all three).
- Claiming Import Queue always needs a human, or that versioning is unsupported.
- Claiming you cannot list/search repository documents.
- Swapping module and documentType.
- Hardcoding a fixed person name (e.g. Wayne) as approvedBy unless that person is the user.
- Converting a chat Spreadsheet/.xlsx (or Word/PPT/TXT request) to PDF.

NEW VERSION
- If user asks for another version of an existing document: check_document_exists → newVersionSubmitHints → submit with mode=NEW_VERSION after the same project/type/module confirmation if needed.
- Server bumps Rev (e.g. Rev 1.0 → Rev 1.1).

Example payload after user picks Project=MOSS, Type=Article, Module=Articles (omit approvedBy so the server uses the MCP key owner):
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"The Goat","description":"Overview of goats as domestic animals.","documentContent":"# The Goat\\n\\n...full markdown..."}

Word example (when the user asked for a Word document):
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"The Goat","fileName":"The Goat.docx","outputFormat":"docx","documentContent":"# The Goat\\n\\n..."}

Excel example:
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"Budget","fileName":"Budget.xlsx","outputFormat":"xlsx","documentContent":"| Item | Amount |\\n| --- | --- |\\n| A | 10 |"}

PowerPoint example:
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"Q3 Briefing","fileName":"Q3 Briefing.pptx","outputFormat":"pptx","documentContent":"# Q3 Briefing\\n\\n## Highlights\\n- Revenue up\\n- New clients"}

Plain text example:
{"projectCode":"MOSS","module":"Articles","documentType":"Article","title":"Notes","fileName":"Notes.txt","outputFormat":"txt","documentContent":"# Notes\\n\\nPlain text body..."}

WORKSPACES (resume across chats)
- Repository is the source of truth — never rely on ChatGPT chat history alone.
- create_workspace → tell the user Workspace ID WS-YYYY-##### to resume later.
- find_workspaces / get_latest_pending_workspace / get_workspace / resume_workspace / get_workspace_summary / list_workspace_documents for continue flows.
- Phrases: "Resume workspace WS-…", "Continue my latest pending import".

Tools: list_repository_projects, list_document_types, list_repository_modules, resolve_import_targets, search_documents, get_document, check_document_exists, submit_approved_document, get_import_status, create_workspace, get_workspace, find_workspaces, get_latest_pending_workspace, get_workspace_summary, list_workspace_documents, resume_workspace, validate_workspace, submit_workspace, attach_document_to_workspace.`;
