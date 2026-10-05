import { eq } from "drizzle-orm";
import { publicBaseUrl } from "../../config/env";
import { SIGN_BATCH_LIMIT } from "../../config/limits";
import { getDb } from "../../db/client";
import { orderFiles, orders, uploadParts } from "../../db/schema";
import { completeMultipartUpload, localFilePath, localFileSize, signDownload, signUploadPart, writeLocalFile } from "../storage";

export async function ownedUpload(fileId: string, userId: string) {
  const db = await getDb();
  const [file] = await db.select().from(orderFiles).where(eq(orderFiles.id, fileId)).limit(1);
  if (!file) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, file.orderId)).limit(1);
  if (!order || order.userId !== userId) return null;
  return { file, order };
}

export function expectedPartSize(sizeBytes: number, partSize: number, partNumber: number) {
  const start = (partNumber - 1) * partSize;
  if (start >= sizeBytes) return 0;
  return Math.min(partSize, sizeBytes - start);
}

export async function signParts(fileId: string, userId: string, partNumbers: number[]) {
  if (partNumbers.length === 0 || partNumbers.length > SIGN_BATCH_LIMIT) {
    return { ok: false as const, status: 400 as const, error: "Ask for up to 20 pieces at a time." };
  }

  const owned = await ownedUpload(fileId, userId);
  if (!owned) return { ok: false as const, status: 404 as const, error: "That file is not on your order." };
  if (owned.file.status === "complete") {
    return { ok: false as const, status: 409 as const, error: "This file is already stored." };
  }

  for (const partNumber of partNumbers) {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > owned.file.partCount) {
      return { ok: false as const, status: 400 as const, error: "That piece is outside the file." };
    }
  }

  if (owned.file.mode === "direct") {
    return {
      ok: true as const,
      mode: "direct" as const,
      parts: partNumbers.map((partNumber) => ({
        partNumber,
        url: `${publicBaseUrl()}/api/uploads/${owned.file.id}/parts/${partNumber}`,
      })),
    };
  }

  if (!owned.file.uploadId) {
    return { ok: false as const, status: 500 as const, error: "The storage upload was not opened." };
  }

  const parts = [];
  for (const partNumber of partNumbers) {
    const url = await signUploadPart(owned.file.storageKey, owned.file.uploadId, partNumber);
    parts.push({ partNumber, url });
  }
  return { ok: true as const, mode: "presigned" as const, parts };
}

export async function recordPart(fileId: string, userId: string, partNumber: number, etag: string) {
  const owned = await ownedUpload(fileId, userId);
  if (!owned) return { ok: false as const, status: 404 as const, error: "That file is not on your order." };
  if (owned.file.status === "complete") return { ok: true as const };
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > owned.file.partCount) {
    return { ok: false as const, status: 400 as const, error: "That piece is outside the file." };
  }
  if (!etag || etag.length > 200) {
    return { ok: false as const, status: 400 as const, error: "The storage tag was missing." };
  }

  const db = await getDb();
  await db
    .insert(uploadParts)
    .values({ fileId, partNumber, etag })
    .onConflictDoUpdate({
      target: [uploadParts.fileId, uploadParts.partNumber],
      set: { etag },
    });

  const parts = await db.select({ id: uploadParts.id }).from(uploadParts).where(eq(uploadParts.fileId, fileId));
  await db.update(orderFiles).set({ partsCompleted: parts.length }).where(eq(orderFiles.id, fileId));
  return { ok: true as const };
}

export async function writeDirectPart(fileId: string, userId: string, partNumber: number, bytes: Buffer) {
  const owned = await ownedUpload(fileId, userId);
  if (!owned) return { ok: false as const, status: 404 as const, error: "That file is not on your order." };
  if (owned.file.mode !== "direct") {
    return { ok: false as const, status: 400 as const, error: "This file uploads straight to storage." };
  }
  if (owned.file.status === "complete") return { ok: true as const, etag: `direct-${partNumber}` };

  const expected = expectedPartSize(owned.file.sizeBytes, owned.file.partSize, partNumber);
  if (expected < 1 || bytes.byteLength !== expected) {
    return { ok: false as const, status: 400 as const, error: "That piece is the wrong size." };
  }

  await writeLocalFile(owned.file.storageKey, bytes);
  const saved = await recordPart(fileId, userId, partNumber, `direct-${partNumber}`);
  if (!saved.ok) return saved;
  return { ok: true as const, etag: `direct-${partNumber}` };
}

async function markReceived(orderId: string) {
  const db = await getDb();
  const files = await db.select({ status: orderFiles.status }).from(orderFiles).where(eq(orderFiles.orderId, orderId));
  if (files.length > 0 && files.every((file) => file.status === "complete")) {
    await db.update(orders).set({ status: "received" }).where(eq(orders.id, orderId));
  }
}

export async function finishUpload(fileId: string, userId: string) {
  const owned = await ownedUpload(fileId, userId);
  if (!owned) return { ok: false as const, status: 404 as const, error: "That file is not on your order." };
  if (owned.file.status === "complete") return { ok: true as const };

  const db = await getDb();
  const parts = await db
    .select({ partNumber: uploadParts.partNumber, etag: uploadParts.etag })
    .from(uploadParts)
    .where(eq(uploadParts.fileId, fileId));

  if (parts.length !== owned.file.partCount) {
    return { ok: false as const, status: 400 as const, error: "The file is still missing pieces." };
  }

  if (owned.file.mode === "presigned") {
    if (!owned.file.uploadId) {
      return { ok: false as const, status: 500 as const, error: "The storage upload was not opened." };
    }
    await completeMultipartUpload(owned.file.storageKey, owned.file.uploadId, parts);
  } else {
    const size = await localFileSize(owned.file.storageKey);
    if (size !== owned.file.sizeBytes) {
      return { ok: false as const, status: 400 as const, error: "The stored file size does not match." };
    }
  }

  await db
    .update(orderFiles)
    .set({ status: "complete", completedAt: new Date(), partsCompleted: parts.length })
    .where(eq(orderFiles.id, fileId));
  await markReceived(owned.order.id);
  return { ok: true as const };
}

export function attachmentName(filename: string) {
  const safe = filename.replace(/[/\\]/g, "_").trim() || "file";
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function downloadTarget(fileId: string, userId: string) {
  const owned = await ownedUpload(fileId, userId);
  if (!owned) return { ok: false as const, status: 404 as const, error: "That file is not on your order." };
  if (owned.file.status !== "complete") {
    return { ok: false as const, status: 409 as const, error: "This file is still sending. Download it after it is stored." };
  }

  if (owned.file.mode === "presigned") {
    const url = await signDownload(owned.file.storageKey, owned.file.originalName);
    return { ok: true as const, kind: "redirect" as const, redirect: url };
  }

  return {
    ok: true as const,
    kind: "file" as const,
    path: localFilePath(owned.file.storageKey),
    name: owned.file.originalName,
    type: owned.file.contentType || "application/octet-stream",
    size: owned.file.sizeBytes,
  };
}

export async function uploadStatus(fileId: string, userId: string) {
  const owned = await ownedUpload(fileId, userId);
  if (!owned) return null;
  const db = await getDb();
  const parts = await db
    .select({ partNumber: uploadParts.partNumber })
    .from(uploadParts)
    .where(eq(uploadParts.fileId, fileId));

  return {
    id: owned.file.id,
    name: owned.file.originalName,
    size: owned.file.sizeBytes,
    partSize: owned.file.partSize,
    partCount: owned.file.partCount,
    mode: owned.file.mode,
    status: owned.file.status,
    completedParts: parts.map((part) => part.partNumber),
  };
}
