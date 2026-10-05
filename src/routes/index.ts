import type { Hono } from "hono";
import { registerAuthRoutes } from "../modules/auth/routes";
import { registerHealthRoutes } from "../modules/health/routes";

export function registerRoutes(app: Hono) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
}
