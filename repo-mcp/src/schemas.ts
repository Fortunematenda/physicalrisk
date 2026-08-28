import { z } from 'zod';

export const prepareUploadSchema = {
  projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
  module: z.string().optional().describe('Module/section name e.g. Governance Standards'),
  documentType: z.string().optional().describe('e.g. Master Control Catalogue, Article'),
  title: z.string().optional(),
  documentCode: z.string().optional().describe('Existing code e.g. MOSS-GS-003 for NEW_VERSION'),
  mode: z.enum(['NEW', 'NEW_VERSION']).optional().describe(
    'NEW_VERSION = same document, next Rev. Use with documentCode.',
  ),
  versionNo: z.string().optional(),
  fileName: z.string().optional().describe('Original filename with extension, e.g. Catalogue.docx'),
  mimeType: z.string().optional(),
  workspaceCode: z.string().optional().describe('WS-YYYY-#####'),
  owner: z.string().optional(),
  description: z.string().optional(),
  existingDocumentId: z.string().uuid().optional(),
  payload: z.string().optional().describe(
    'JSON metadata only: projectCode, module, documentType, title, fileName, mode, documentCode. NEVER documentContent.',
  ),
};

export const submitFileSchema = {
  projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
  module: z.string().optional().describe('Module/section name'),
  documentType: z.string().optional().describe('e.g. Research Note, Article'),
  title: z.string().optional(),
  documentCode: z.string().optional(),
  mode: z.enum(['NEW', 'NEW_VERSION']).optional(),
  versionNo: z.string().optional(),
  fileName: z.string().optional().describe('Original filename with extension (.docx, .xlsx, .pdf, …)'),
  mimeType: z.string().optional(),
  fileContentBase64: z.string().optional().describe('Base64 of the exact original file bytes'),
  fileUrl: z.string().url().optional().describe('HTTPS URL to the original artifact'),
  uploadId: z.string().uuid().optional().describe('From chunked upload session'),
  sourceSha256: z.string().optional().describe('Optional SHA-256 hex of source bytes'),
  workspaceCode: z.string().optional().describe('WS-YYYY-#####'),
  owner: z.string().optional(),
  description: z.string().optional(),
  payload: z.string().optional(),
};

export const searchDocsSchema = {
  search: z.string().optional().describe('Match title, document code, or type'),
  projectCode: z.string().optional().describe('e.g. MCRD, MOSS, PROR'),
  projectId: z.string().optional(),
  status: z.string().optional().describe('e.g. CURRENT'),
  limit: z.number().int().min(1).max(200).optional().describe('Max rows (default 50)'),
};
