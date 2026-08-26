import {
  looksLikeMarkdownOrHtml,
  validateOoxmlPackage,
  validatePdfSignature,
  validateStoredBinary,
  validateStoredBinaryFromFile,
  validateZipSignature,
} from './mcp-ooxml-validate.util';

/** Build a minimal ZIP containing uncompressed store entries (method 0). */
export function buildMinimalZip(entries: Array<{ name: string; data: Buffer | string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length + dataBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc (0 ok for tests)
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    dataBuf.copy(local, 30 + nameBuf.length);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const cdOffset = offset;
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

describe('mcp-ooxml-validate.util', () => {
  it('accepts PK zip signature', () => {
    const zip = buildMinimalZip([{ name: 'a.txt', data: 'hi' }]);
    expect(validateZipSignature(zip).ok).toBe(true);
  });

  it('rejects non-zip buffers', () => {
    expect(validateZipSignature(Buffer.from('# markdown')).ok).toBe(false);
  });

  it('validates minimal docx OOXML package', () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const result = validateOoxmlPackage(docx, 'docx');
    expect(result.ok).toBe(true);
  });

  it('rejects markdown disguised as docx', () => {
    const md = Buffer.from('# Title\n\nSome markdown body\n');
    const result = validateStoredBinary(md, 'report.docx');
    expect(result.ok).toBe(false);
    expect(result.detectedKind).toBe('markdown_or_html');
    expect(looksLikeMarkdownOrHtml(md)).toBe(true);
  });

  it('rejects html disguised as xlsx', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>x</body></html>');
    const result = validateStoredBinary(html, 'sheet.xlsx');
    expect(result.ok).toBe(false);
  });

  it('validates PDF signature', () => {
    expect(validatePdfSignature(Buffer.from('%PDF-1.4\n%âãÏÓ')).ok).toBe(true);
    expect(validatePdfSignature(Buffer.from('not-a-pdf')).ok).toBe(false);
  });

  it('accepts valid docx via validateStoredBinary', () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const result = validateStoredBinary(docx, 'memo.docx');
    expect(result.ok).toBe(true);
    expect(result.detectedKind).toBe('docx');
    expect(result.mimeType).toContain('wordprocessingml');
  });

  it('accepts minimal xlsx and pptx packages', () => {
    const xlsx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'xl/workbook.xml', data: '<workbook/>' },
    ]);
    expect(validateStoredBinary(xlsx, 'sheet.xlsx').ok).toBe(true);
    const pptx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'ppt/presentation.xml', data: '<presentation/>' },
    ]);
    expect(validateStoredBinary(pptx, 'deck.pptx').ok).toBe(true);
  });

  it('rejects csv disguised as xlsx', () => {
    const csv = Buffer.from('a,b,c\n1,2,3\n');
    const result = validateStoredBinary(csv, 'sheet.xlsx');
    expect(result.ok).toBe(false);
  });

  it('rejects truncated zip missing EOCD', () => {
    const zip = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const truncated = zip.subarray(0, Math.min(40, zip.length));
    expect(validateZipSignature(truncated).ok).toBe(true);
    expect(validateOoxmlPackage(truncated, 'docx').ok).toBe(false);
  });

  it('validateStoredBinaryFromFile matches in-memory result', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { validateStoredBinaryFromFile } = await import('./mcp-ooxml-validate.util');
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ooxml-'));
    const file = path.join(dir, 'memo.docx');
    await fs.writeFile(file, docx);
    try {
      const result = await validateStoredBinaryFromFile(file, 'memo.docx');
      expect(result.ok).toBe(true);
      expect(result.detectedKind).toBe('docx');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
