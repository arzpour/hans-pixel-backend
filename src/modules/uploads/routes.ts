import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import type { Hono } from "hono";
import { asRecord, errorJson, readJson } from "../../lib/http";
import { requireUser } from "../../middleware/auth";
import { isAdminEmail } from "../auth/identity";
import { attachmentName, downloadTarget, finishUpload, recordPart, signParts, uploadStatus, writeDirectPart } from "./service";

export function registerUploadRoutes(app: Hono) {
  app.get("/api/uploads/:fileId/download", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const result = await downloadTarget(c.req.param("fileId"), auth.user.id, isAdminEmail(auth.user.email));
    if (!result.ok) return errorJson(c, result.error, result.status);
    if (result.kind === "redirect") return c.redirect(result.redirect);
    try {
      await stat(result.path);
    } catch {
      return errorJson(c, "That file is not stored yet.", 404);
    }
    const stream = Readable.toWeb(createReadStream(result.path)) as ReadableStream;
    return c.body(stream, 200, {
      "Content-Type": result.type,
      "Content-Disposition": attachmentName(result.name),
      "Content-Length": String(result.size),
    });
  });

  app.get("/api/uploads/:fileId", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const status = await uploadStatus(c.req.param("fileId"), auth.user.id);
    if (!status) return errorJson(c, "That file is not on your order.", 404);
    return c.json(status);
  });

  app.post("/api/uploads/:fileId/sign", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const body = asRecord(await readJson(c));
    const partNumbers = Array.isArray(body?.partNumbers)
      ? body.partNumbers.filter((item): item is number => typeof item === "number")
      : [];
    const result = await signParts(c.req.param("fileId"), auth.user.id, partNumbers);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ mode: result.mode, parts: result.parts });
  });

  app.post("/api/uploads/:fileId/parts", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const body = asRecord(await readJson(c));
    const partNumber = typeof body?.partNumber === "number" ? body.partNumber : Number.NaN;
    const etag = typeof body?.etag === "string" ? body.etag.trim() : "";
    const result = await recordPart(c.req.param("fileId"), auth.user.id, partNumber, etag);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ ok: true });
  });

  app.put("/api/uploads/:fileId/parts/:partNumber", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const partNumber = Number(c.req.param("partNumber"));
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const result = await writeDirectPart(c.req.param("fileId"), auth.user.id, partNumber, bytes);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ etag: result.etag });
  });

  app.post("/api/uploads/:fileId/complete", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const result = await finishUpload(c.req.param("fileId"), auth.user.id);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ ok: true });
  });
}
