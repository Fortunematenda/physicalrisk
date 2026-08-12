jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  createReadStream: jest.fn(() => ({ pipe: jest.fn(), on: jest.fn() })),
}));

import { DocumentsController } from './documents.controller';

describe('DocumentsController file routes', () => {
  const versionFile = jest.fn();
  const controller = new DocumentsController({ versionFile } as any);

  function response() {
    return { setHeader: jest.fn() } as any;
  }

  beforeEach(() => {
    versionFile.mockReset();
  });

  it('uses inline disposition for PDF files', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/pdf', originalFileName: 'approved.pdf' },
      absolutePath: 'C:/storage/approved.pdf',
    });
    const result = response();

    await controller.view('version-1', result);

    expect(result.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(result.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="approved.pdf"; filename*=UTF-8\'\'approved.pdf',
    );
  });

  it('uses attachment disposition for DOCX files (not browser-previewable)', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'report.docx' },
      absolutePath: 'C:/storage/report.docx',
    });
    const result = response();

    await controller.view('version-2', result);

    expect(result.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="report.docx"; filename*=UTF-8\'\'report.docx',
    );
  });

  it('uses attachment disposition for unsupported inline types', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/zip', originalFileName: 'bundle.zip' },
      absolutePath: 'C:/storage/bundle.zip',
    });
    const result = response();

    await controller.view('version-3', result);

    expect(result.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="bundle.zip"; filename*=UTF-8\'\'bundle.zip',
    );
  });

  it('always uses attachment disposition for secure downloads', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/pdf', originalFileName: 'approved.pdf' },
      absolutePath: 'C:/storage/approved.pdf',
    });
    const result = response();

    await controller.download('version-1', result);

    expect(result.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="approved.pdf"; filename*=UTF-8\'\'approved.pdf',
    );
  });

  it('ASCII-fallbacks en-dash filenames so Node does not reject Content-Disposition', async () => {
    versionFile.mockResolvedValue({
      version: {
        mimeType: 'application/pdf',
        originalFileName: 'Borehole Shop Business Plan – Zimbabwe.pdf',
      },
      absolutePath: 'C:/storage/plan.pdf',
    });
    const result = response();

    await controller.download('version-en-dash', result);

    const disposition = (result.setHeader as jest.Mock).mock.calls
      .find((call) => call[0] === 'Content-Disposition')?.[1] as string;
    expect(disposition).toContain('filename="Borehole Shop Business Plan - Zimbabwe.pdf"');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition.match(/filename="([^"]*)"/)?.[1]).not.toMatch(/–/);
  });
});
