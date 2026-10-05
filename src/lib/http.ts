import type { Context } from "hono";

export function errorJson(c: Context, message: string, status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502) {
  return c.json({ error: message }, status);
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
