import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { registerErrorHandlers } from "./middleware/errors";
import { registerRoutes } from "./routes";

export function createApp() {
  const app = new Hono();
  app.use("*", corsMiddleware());
  registerRoutes(app);
  registerErrorHandlers(app);
  return app;
}
