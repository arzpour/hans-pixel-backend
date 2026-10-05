import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { missingSignInConfig, port } from "./config/env";

const app = createApp();

serve({ fetch: app.fetch, port: port() }, (info) => {
  const missing = missingSignInConfig();
  console.log(`Hans Pixel API http://localhost:${info.port}`);
  if (missing.length > 0) {
    console.warn(`Fill these in hans pixel backend/.env before sign-in works: ${missing.join(", ")}`);
  }
});
