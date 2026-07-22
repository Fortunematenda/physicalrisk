import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || 'moss-evidence';
    const region = config.get<string>('S3_REGION') || 'us-east-1';
    const forcePathStyle = (config.get<string>('S3_FORCE_PATH_STYLE') || 'true') === 'true';
    const credentials = {
      accessKeyId: config.get<string>('S3_ACCESS_KEY') || 'REDACTED_S3_ACCESS_KEY',
      secretAccessKey: config.get<string>('S3_SECRET_KEY') || 'REDACTED_S3_SECRET_KEY',
    };
    const endpoint = config.get<string>('S3_ENDPOINT') || 'http://minio:9000';
    const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT') || endpoint;

    this.client = new S3Client({ endpoint, region, forcePathStyle, credentials });
    this.signingClient = publicEndpoint === endpoint
      ? this.client
      : new S3Client({ endpoint: publicEndpoint, region, forcePathStyle, credentials });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return key;
  }

  get(key: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getBuffer(key: string): Promise<Buffer> {
    const obj = await this.get(key);
    const body = obj.Body as {
      transformToByteArray?: () => Promise<Uint8Array>;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
    } | undefined;
    if (!body) return Buffer.alloc(0);
    if (typeof body.transformToByteArray === 'function') {
      return Buffer.from(await body.transformToByteArray());
    }
    const chunks: Buffer[] = [];
    if (typeof body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  signedDownloadUrl(key: string, expiresIn = 900) {
    return getSignedUrl(this.signingClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
}
