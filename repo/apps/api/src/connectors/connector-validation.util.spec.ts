import { BadRequestException } from '@nestjs/common';
import { assertFileSizeAllowed, assertMimeTypeAllowed, sanitizeConnectorFileName } from './connector-validation.util';
import { FileType } from '../database/entities';

describe('connector validation helpers', () => {
  const fileType: FileType = {
    id: '1',
    extension: 'pdf',
    label: 'PDF',
    mimeTypes: ['application/pdf'],
    maxSizeMb: 1,
    allowMetadataExtraction: true,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('sanitizes unsafe file names', () => {
    expect(sanitizeConnectorFileName('report/../final?.pdf')).toBe('report-..-final-.pdf');
    expect(sanitizeConnectorFileName('   ')).toBe('document');
  });

  it('validates allowed mime types', () => {
    expect(() => assertMimeTypeAllowed('application/pdf', fileType, 'report.pdf')).not.toThrow();
    expect(() => assertMimeTypeAllowed('text/plain', fileType, 'report.pdf')).toThrow(BadRequestException);
  });

  it('validates file size limits', () => {
    expect(() => assertFileSizeAllowed(512 * 1024, fileType)).not.toThrow();
    expect(() => assertFileSizeAllowed(2 * 1024 * 1024, fileType)).toThrow(BadRequestException);
  });
});
