import { cors } from "hono/cors";
import { allowedOrigins } from "../config/env";

export function corsMiddleware() {
  const origins = allowedOrigins();
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  });
}
