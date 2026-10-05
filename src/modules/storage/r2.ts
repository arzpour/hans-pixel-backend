import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Settings } from "../../config/env";
import type { R2Config } from "../../types/storage";

export function r2Config() {
  return r2Settings();
}

let client: S3Client | null = null;

function r2Client(config: R2Config) {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export async function createMultipartUpload(key: string, contentType: string | null) {
  const config = r2Config();
  if (!config || "error" in config) throw new Error("R2 is not configured");
  const created = await r2Client(config).send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  if (!created.UploadId) throw new Error("R2 did not open an upload");
  return created.UploadId;
}

export async function signUploadPart(key: string, uploadId: string, partNumber: number) {
  const config = r2Config();
  if (!config || "error" in config) throw new Error("R2 is not configured");
  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(r2Client(config), command, { expiresIn: 60 * 60 });
}

export async function signDownload(key: string, filename: string) {
  const config = r2Config();
  if (!config || "error" in config) throw new Error("R2 is not configured");
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentDisposition: attachmentName(filename),
  });
  return getSignedUrl(r2Client(config), command, { expiresIn: 10 * 60 });
}

function attachmentName(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  const config = r2Config();
  if (!config || "error" in config) throw new Error("R2 is not configured");
  await r2Client(config).send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}
