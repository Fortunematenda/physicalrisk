jest.mock('../common/binary-stream.util', () => ({
  streamBinaryFile: jest.fn(async () => undefined),
}));

import { streamBinaryFile } from '../common/binary-stream.util';
import { DocumentsController } from './documents.controller';

describe('DocumentsController file routes', () => {
  const prepareBinaryDownload = jest.fn();
  const controller = new DocumentsController({ prepareBinaryDownload } as any);

  function response() {
    return { setHeader: jest.fn(), status: jest.fn().mockReturnThis() } as any;
  }

  beforeEach(() => {
    prepareBinaryDownload.mockReset();
    (streamBinaryFile as jest.Mock).mockClear();
  });

  it('uses inline disposition for PDF files', async () => {
    prepareBinaryDownload.mockResolvedValue({
      version: { mimeType: 'application/pdf', originalFileName: 'approved.pdf' },
      absolutePath: 'C:/storage/approved.pdf',
      integrity: { size: 12, sha256: 'abc', checksumMatch: true },
    });
    const result = response();

    await controller.view('version-1', result);

    expect(streamBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'inline',
        mimeType: 'application/pdf',
        fileName: 'approved.pdf',
      }),
    );
  });

  it('uses attachment disposition for DOCX files (not browser-previewable)', async () => {
    prepareBinaryDownload.mockResolvedValue({
      version: {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalFileName: 'report.docx',
      },
      absolutePath: 'C:/storage/report.docx',
      integrity: { size: 12, sha256: 'abc', checksumMatch: true },
    });
    const result = response();

    await controller.view('version-2', result);

    expect(streamBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'attachment',
        fileName: 'report.docx',
      }),
    );
  });

  it('forces application/zip Content-Type for ZIP archives', async () => {
    prepareBinaryDownload.mockResolvedValue({
      version: { mimeType: 'application/zip', originalFileName: 'bundle.zip' },
      absolutePath: 'C:/storage/bundle.zip',
      integrity: { size: 40, sha256: 'abc', checksumMatch: true, zipValid: true, zipEntryCount: 2 },
    });
    const result = response();

    await controller.view('version-3', result);

    expect(streamBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'attachment',
        mimeType: 'application/zip',
        fileName: 'bundle.zip',
      }),
    );
  });

  it('always uses attachment disposition for secure downloads', async () => {
    prepareBinaryDownload.mockResolvedValue({
      version: { mimeType: 'application/pdf', originalFileName: 'approved.pdf' },
      absolutePath: 'C:/storage/approved.pdf',
      integrity: { size: 12, sha256: 'abc', checksumMatch: true },
    });
    const result = response();

    await controller.download('version-1', result);

    expect(streamBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'attachment',
        fileName: 'approved.pdf',
      }),
    );
  });

  it('ASCII-fallbacks en-dash filenames so Node does not reject Content-Disposition', async () => {
    prepareBinaryDownload.mockResolvedValue({
      version: {
        mimeType: 'application/pdf',
        originalFileName: 'Borehole Shop Business Plan – Zimbabwe.pdf',
      },
      absolutePath: 'C:/storage/plan.pdf',
      integrity: { size: 12, sha256: 'abc', checksumMatch: true },
    });
    const result = response();

    await controller.download('version-en-dash', result);

    expect(streamBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Borehole Shop Business Plan – Zimbabwe.pdf',
        disposition: 'attachment',
      }),
    );
  });
});
