import { buildContentDisposition } from './content-disposition.util';

describe('buildContentDisposition', () => {
  it('keeps simple ASCII names', () => {
    expect(buildContentDisposition('attachment', 'report.pdf')).toBe(
      'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf',
    );
  });

  it('ASCII-fallback for en-dash titles that previously crashed Node headers', () => {
    const header = buildContentDisposition(
      'attachment',
      'Borehole Shop Business Plan – Zimbabwe.pdf',
    );
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).toContain('filename="Borehole Shop Business Plan - Zimbabwe.pdf"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E2%80%93'); // en-dash in UTF-8 form
    // Must not put raw en-dash in the quoted filename= token
    const quoted = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(quoted).not.toMatch(/–/);
  });
});
