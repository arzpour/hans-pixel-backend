import { randomUUID } from "crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { DIRECT_MAX_BYTES, MAX_FILE_BYTES, MAX_FILES_PER_ORDER, PART_SIZE } from "../../config/limits";
import { getDb } from "../../db/client";
import { orderFiles, orders, users } from "../../db/schema";
import { formatBytes } from "../../lib/format";
import type { IncomingFile, PublicOrder } from "../../types/order";
import type { UploadTarget } from "../../types/upload";
import { createMultipartUpload, r2Config } from "../storage";
import { isOrderablePath } from "./catalog";

function safeFileName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

function planFile(size: number) {
  const storage = r2Config();
  if (storage && "error" in storage) {
    return { ok: false as const, status: 500 as const, error: "R2 is only partly configured." };
  }
  if (size > MAX_FILE_BYTES) {
    return { ok: false as const, status: 400 as const, error: "Each file can be at most 100 GB." };
  }
  if (storage) {
    const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
    return { ok: true as const, mode: "presigned" as const, partSize: PART_SIZE, partCount };
  }
  if (size > DIRECT_MAX_BYTES) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `Files over ${formatBytes(DIRECT_MAX_BYTES)} need Cloudflare R2 before they can be stored.`,
    };
  }
  return { ok: true as const, mode: "direct" as const, partSize: size, partCount: 1 };
}

export function parseOrderFiles(value: unknown): IncomingFile[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES_PER_ORDER) return null;
  const files: IncomingFile[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const size = typeof record.size === "number" ? record.size : Number.NaN;
    const type = typeof record.type === "string" && record.type.trim() ? record.type.trim().slice(0, 200) : null;
    if (!name || name.length > 240 || !Number.isInteger(size) || size < 1) return null;
    files.push({ name, size, type });
  }
  return files;
}

export async function createOrder(userId: string, serviceHref: string, note: string, incoming: IncomingFile[]) {
  if (!isOrderablePath(serviceHref)) {
    return { ok: false as const, status: 400 as const, error: "Choose a service before sending files." };
  }

  const planned = incoming.map((file) => ({ file, plan: planFile(file.size) }));
  const rejected = planned.find((item) => !item.plan.ok);
  if (rejected && !rejected.plan.ok) return rejected.plan;

  const db = await getDb();
  const orderId = randomUUID();
  const rows = planned.map((item) => {
    const plan = item.plan;
    if (!plan.ok) throw new Error("Upload plan was rejected");
    const id = randomUUID();
    return {
      id,
      orderId,
      originalName: item.file.name,
      sizeBytes: item.file.size,
      contentType: item.file.type,
      storageKey: `orders/${orderId}/${id}/${safeFileName(item.file.name)}`,
      mode: plan.mode,
      partSize: plan.partSize,
      partCount: plan.partCount,
      status: "uploading" as const,
    };
  });

  await db.insert(orders).values({
    id: orderId,
    userId,
    serviceHref,
    note: note.trim() ? note.trim().slice(0, 2000) : null,
    status: "uploading",
  });
  await db.insert(orderFiles).values(rows);

  try {
    for (const row of rows) {
      if (row.mode !== "presigned") continue;
      const uploadId = await createMultipartUpload(row.storageKey, row.contentType);
      await db.update(orderFiles).set({ uploadId }).where(eq(orderFiles.id, row.id));
    }
  } catch (error) {
    await db.delete(orders).where(eq(orders.id, orderId));
    throw error;
  }

  const targets: UploadTarget[] = rows.map((row) => ({
    id: row.id,
    name: row.originalName,
    size: row.sizeBytes,
    partSize: row.partSize,
    partCount: row.partCount,
    mode: row.mode,
  }));

  return { ok: true as const, orderId, files: targets };
}

async function withFiles(orderRows: (typeof orders.$inferSelect)[]): Promise<PublicOrder[]> {
  if (orderRows.length === 0) return [];
  const db = await getDb();
  const orderIds = orderRows.map((order) => order.id);
  const files = await db.select().from(orderFiles).where(inArray(orderFiles.orderId, orderIds));
  const userIds = [...new Set(orderRows.map((order) => order.userId))];
  const people = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  const personById = new Map(people.map((person) => [person.id, person]));

  return orderRows.map((order) => ({
    id: order.id,
    serviceHref: order.serviceHref,
    note: order.note,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    senderName: personById.get(order.userId)?.name ?? null,
    senderEmail: personById.get(order.userId)?.email ?? "",
    files: files
      .filter((file) => file.orderId === order.id)
      .map((file) => ({
        id: file.id,
        name: file.originalName,
        size: file.sizeBytes,
        status: file.status,
        partsCompleted: file.partsCompleted,
        partCount: file.partCount,
      })),
  }));
}

export async function listReceivedOrders(userId: string, admin: boolean) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(admin ? eq(orders.status, "received") : and(eq(orders.userId, userId), eq(orders.status, "received")))
    .orderBy(desc(orders.createdAt))
    .limit(admin ? 100 : 20);
  return withFiles(rows);
}

export async function cancelOrder(orderId: string, userId: string) {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!order) return { ok: false as const, status: 404 as const, error: "That order is not yours." };
  if (order.status === "received") {
    return { ok: false as const, status: 409 as const, error: "A received order stays on the list." };
  }
  if (order.status !== "cancelled") {
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
    await db
      .update(orderFiles)
      .set({ status: "cancelled" })
      .where(and(eq(orderFiles.orderId, orderId), ne(orderFiles.status, "complete")));
  }
  return { ok: true as const };
}
