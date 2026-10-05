import type { Hono } from "hono";
import { serviceStatus } from "../../config/env";

export function registerHealthRoutes(app: Hono) {
  app.get("/health", (c) => c.json({ ok: true, ...serviceStatus() }));
}
