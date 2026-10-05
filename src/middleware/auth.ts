import type { Context } from "hono";
import { errorJson } from "../lib/http";
import { getSession } from "../modules/auth/service";

export async function requireUser(c: Context) {
  const user = await getSession(c);
  if (!user) return { user: null, response: errorJson(c, "Verify your identity before you place an order.", 401) };
  return { user, response: null };
}
