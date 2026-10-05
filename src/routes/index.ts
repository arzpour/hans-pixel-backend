import type { Hono } from "hono";
import { registerAuthRoutes } from "../modules/auth/routes";
import { registerHealthRoutes } from "../modules/health/routes";
import { registerOrderRoutes } from "../modules/orders/routes";

export function registerRoutes(app: Hono) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerOrderRoutes(app);
}
