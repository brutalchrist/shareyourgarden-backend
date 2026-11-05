import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../common/errors';

// How long a signed upload URL stays valid.
const PRESIGN_EXPIRES_SECONDS = 10 * 60;
// Stored objects never change (a new photo gets a new key), so browsers and
// the CDN can keep them for good.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
// DeleteObjects accepts at most 1000 keys per request.
const DELETE_BATCH_SIZE = 1000;

interface StorageConfig {
  bucket: string;
  publicUrl: string;
  client: S3Client;
}

/**
 * Thin wrapper over an S3-compatible bucket (Cloudflare R2, Backblaze B2,
 * MinIO, AWS S3…). Photo bytes never pass through the backend: browsers
 * upload with signed URLs and the bucket serves them from `PUBLIC_ASSETS_URL`.
 *
 * Storage is optional. Without the `S3_*` variables the app still starts and
 * photo features answer 503 IMAGES_DISABLED, so forks and local setups work
 * without a bucket.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly config: StorageConfig | null;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT');
    const bucket = configService.get<string>('S3_BUCKET');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');
    const publicUrl = configService.get<string>('PUBLIC_ASSETS_URL');

    if (
      !endpoint ||
      !bucket ||
      !accessKeyId ||
      !secretAccessKey ||
      !publicUrl
    ) {
      this.config = null;
      this.logger.warn(
        'S3_* or PUBLIC_ASSETS_URL is not set: product photos are disabled',
      );
      return;
    }

    this.config = {
      bucket,
      publicUrl: publicUrl.replace(/\/+$/, ''),
      client: new S3Client({
        endpoint,
        region: configService.get<string>('S3_REGION') || 'auto',
        credentials: { accessKeyId, secretAccessKey },
        // MinIO needs path-style URLs; R2 and S3 accept them too.
        forcePathStyle: true,
        // By default the SDK signs a CRC32 of the (empty) body into presigned
        // URLs, which breaks browser uploads, and R2 and MinIO don't support
        // every checksum. Only send them when an operation requires one.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    };
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  assertEnabled(): StorageConfig {
    if (!this.config) {
      throw new ServiceUnavailableException({
        message: 'Photo uploads are not configured on this server',
        code: ErrorCode.IMAGES_DISABLED,
      });
    }
    return this.config;
  }

  publicUrl(key: string): string | null {
    return this.config ? `${this.config.publicUrl}/${key}` : null;
  }

  /**
   * Signs a PUT that only accepts this exact type and size: both headers are
   * part of the signature, so the bucket rejects anything else. (R2 has no
   * POST policies, which is how S3 usually caps upload sizes.)
   */
  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
  ): Promise<string> {
    const { client, bucket } = this.assertEnabled();
    const signedHeaders = new Set(['content-type', 'content-length']);

    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      {
        expiresIn: PRESIGN_EXPIRES_SECONDS,
        signableHeaders: signedHeaders,
        unhoistableHeaders: signedHeaders,
      },
    );
  }

  /** The object's size in bytes, or null when it does not exist. */
  async headSize(key: string): Promise<number | null> {
    const { client, bucket } = this.assertEnabled();

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  async copy(from: string, to: string, contentType: string): Promise<void> {
    const { client, bucket } = this.assertEnabled();

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${from}`,
        Key: to,
        MetadataDirective: 'REPLACE',
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  async deleteKeys(keys: string[]): Promise<void> {
    const { client, bucket } = this.assertEnabled();

    for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
      const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const { client, bucket } = this.assertEnabled();
    let continuationToken: string | undefined;

    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => !!key);
      if (keys.length > 0) {
        await this.deleteKeys(keys);
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }
}
