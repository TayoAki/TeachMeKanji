import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { dataDir } from "./paths";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredObject {
  data: Buffer;
  contentType: string;
}

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Local filesystem storage for development and tests. */
export function fileStorage(root: string): Storage {
  const base = resolve(root);
  const pathFor = (key: string) => {
    const full = resolve(join(base, key));
    if (!full.startsWith(base + "/")) throw new Error("Invalid storage key");
    return full;
  };
  return {
    async put(key, data, contentType) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
      await writeFile(`${path}.type`, contentType);
    },
    async get(key) {
      try {
        const path = pathFor(key);
        const [data, contentType] = await Promise.all([
          readFile(path),
          readFile(`${path}.type`, "utf8"),
        ]);
        return { data, contentType };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = pathFor(key);
      await rm(path, { force: true });
      await rm(`${path}.type`, { force: true });
    },
  };
}

/** Any S3-compatible service (AWS S3, Cloudflare R2, MinIO, CloudHike storage). */
export function s3Storage(config: {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? "auto",
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async put(key, data, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const bytes = await result.Body!.transformToByteArray();
        return {
          data: Buffer.from(bytes),
          contentType: result.ContentType ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

let shared: Storage | undefined;

export function getStorage(): Storage {
  if (shared) return shared;
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION } = process.env;
  shared =
    S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
      ? s3Storage({
          bucket: S3_BUCKET,
          accessKeyId: S3_ACCESS_KEY_ID,
          secretAccessKey: S3_SECRET_ACCESS_KEY,
          endpoint: S3_ENDPOINT,
          region: S3_REGION,
        })
      : fileStorage(process.env.STORAGE_DIR ?? dataDir("storage"));
  return shared;
}
