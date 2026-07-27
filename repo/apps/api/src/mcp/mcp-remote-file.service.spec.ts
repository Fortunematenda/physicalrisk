import { BadRequestException } from '@nestjs/common';
import { McpRemoteFileService } from './mcp-remote-file.service';

describe('McpRemoteFileService', () => {
  const service = new McpRemoteFileService();

  it('rejects non-http URLs', () => {
    expect(() => service.parsePublicHttpUrl('ftp://example.com/a.pdf')).toThrow(BadRequestException);
  });

  it('rejects localhost hosts', async () => {
    await expect(service.assertPublicHost('localhost')).rejects.toThrow(BadRequestException);
  });

  it('rejects private IPv4 literals', async () => {
    await expect(service.assertPublicHost('127.0.0.1')).rejects.toThrow(BadRequestException);
    await expect(service.assertPublicHost('10.0.0.5')).rejects.toThrow(BadRequestException);
    await expect(service.assertPublicHost('192.168.1.1')).rejects.toThrow(BadRequestException);
  });

  it('flags private IP helpers correctly', () => {
    expect(service.isPrivateOrLocalIp('127.0.0.1')).toBe(true);
    expect(service.isPrivateOrLocalIp('8.8.8.8')).toBe(false);
    expect(service.isPrivateOrLocalIp('::1')).toBe(true);
  });
});
