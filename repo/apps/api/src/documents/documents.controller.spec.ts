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
    expect(result.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="approved.pdf"');
  });

  it('uses attachment disposition for unsupported inline types', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'report.docx' },
      absolutePath: 'C:/storage/report.docx',
    });
    const result = response();

    await controller.view('version-2', result);

    expect(result.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="report.docx"');
  });

  it('always uses attachment disposition for secure downloads', async () => {
    versionFile.mockResolvedValue({
      version: { mimeType: 'application/pdf', originalFileName: 'approved.pdf' },
      absolutePath: 'C:/storage/approved.pdf',
    });
    const result = response();

    await controller.download('version-1', result);

    expect(result.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="approved.pdf"');
  });
});
