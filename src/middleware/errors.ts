import type { Hono } from "hono";
import { isProduction } from "../config/env";

export function registerErrorHandlers(app: Hono) {
  app.notFound((c) => c.json({ error: "Not found." }, 404));

  app.onError((error, c) => {
    console.error(error);
    const detail = error instanceof Error ? error.message : "Something went wrong.";
    const message = isProduction() ? "Something went wrong." : detail;
    return c.json({ error: message }, 500);
  });
}
