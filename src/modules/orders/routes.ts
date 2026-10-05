import type { Hono } from "hono";
import { MAX_FILES_PER_ORDER } from "../../config/limits";
import { asRecord, errorJson, readJson } from "../../lib/http";
import { requireUser } from "../../middleware/auth";
import { isAdminEmail } from "../auth/identity";
import { cancelOrder, createOrder, listReceivedOrders, parseOrderFiles } from "./service";

export function registerOrderRoutes(app: Hono) {
  app.get("/api/orders", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const orders = await listReceivedOrders(auth.user.id, isAdminEmail(auth.user.email));
    return c.json({ orders });
  });

  app.post("/api/orders/:orderId/cancel", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;
    const result = await cancelOrder(c.req.param("orderId") ?? "", auth.user.id);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ ok: true });
  });

  app.post("/api/orders", async (c) => {
    const auth = await requireUser(c);
    if (!auth.user) return auth.response;

    const body = asRecord(await readJson(c));
    const serviceHref = typeof body?.serviceHref === "string" ? body.serviceHref : "";
    const note = typeof body?.note === "string" ? body.note : "";
    if (!Array.isArray(body?.files) || body.files.length === 0) {
      return errorJson(c, "Add at least one file.", 400);
    }
    if (body.files.length > MAX_FILES_PER_ORDER) {
      return errorJson(c, "Send up to 100 files in one order.", 400);
    }
    const files = parseOrderFiles(body.files);
    if (!files) return errorJson(c, "Check the file names and sizes.", 400);

    const result = await createOrder(auth.user.id, serviceHref, note, files);
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ orderId: result.orderId, files: result.files });
  });
}
