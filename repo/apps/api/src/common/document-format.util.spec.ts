import { alignStoredFileIdentity, sniffDocumentFormat } from './document-format.util';

describe('document-format.util', () => {
  it('sniffs PDF magic even when filename says xlsx', () => {
    const buffer = Buffer.from('%PDF-1.4\n...');
    expect(sniffDocumentFormat({ buffer, fileName: 'plan.xlsx' })).toBe('pdf');
  });

  it('prefers OOXML extension when ZIP magic present', () => {
    const buffer = Buffer.from('PK\u0003\u0004rest');
    expect(sniffDocumentFormat({ buffer, fileName: 'budget.xlsx' })).toBe('xlsx');
    expect(sniffDocumentFormat({ buffer, fileName: 'report.docx' })).toBe('docx');
  });

  it('maps legacy Office extensions to modern formats', () => {
    expect(sniffDocumentFormat({ fileName: 'old.doc' })).toBe('docx');
    expect(sniffDocumentFormat({ fileName: 'old.xls' })).toBe('xlsx');
    expect(sniffDocumentFormat({ fileName: 'old.ppt' })).toBe('pptx');
  });

  it('aligns identity and strips en-dash for storage names', () => {
    const aligned = alignStoredFileIdentity({
      fileName: 'Borehole Shop Business Plan – Zimbabwe.xlsx',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PK\u0003\u0004sheet'),
    });
    expect(aligned.format).toBe('xlsx');
    expect(aligned.fileName).toBe('Borehole Shop Business Plan - Zimbabwe.xlsx');
    expect(aligned.mimeType).toContain('spreadsheetml');
  });

  it('detects xlsx OOXML even when GPT names the file .pdf', () => {
    const buffer = Buffer.concat([
      Buffer.from('PK\u0003\u0004'),
      Buffer.from('xl/worksheets/sheet1.xml'),
    ]);
    expect(sniffDocumentFormat({
      buffer,
      fileName: 'plan.pdf',
      mimeType: 'application/pdf',
    })).toBe('xlsx');
  });
});
