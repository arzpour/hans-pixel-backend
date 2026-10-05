import type { Hono } from "hono";
import { asRecord, errorJson, readJson } from "../../lib/http";
import { setSessionCookie } from "./cookies";
import { isAdminEmail, isEmail, normalizeEmail } from "./identity";
import { getSession, logout, requestSignInCode, verifySignInCode } from "./service";

export function registerAuthRoutes(app: Hono) {
  app.post("/api/auth/request-code", async (c) => {
    const body = asRecord(await readJson(c));
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    if (!isEmail(email)) return errorJson(c, "Enter a valid email address.", 400);

    const result = await requestSignInCode(email);
    console.log("requestSignInCode", result);
    
    if (!result.ok) return errorJson(c, result.error, result.status);
    return c.json({ ok: true, devCode: result.devCode });
  });

  app.post("/api/auth/verify-code", async (c) => {
    const body = asRecord(await readJson(c));
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const code = (typeof body?.code === "string" ? body.code : "").replace(/\s+/g, "");
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!isEmail(email)) return errorJson(c, "Enter a valid email address.", 400);
    if (!/^\d{6}$/.test(code)) return errorJson(c, "Enter the 6-digit code.", 400);
    if (name.length > 80) return errorJson(c, "Use a shorter name.", 400);

    const result = await verifySignInCode(email, code, name || undefined);
    if (!result.ok) return errorJson(c, result.error, result.status);
    setSessionCookie(c, result.token);
    return c.json({ ok: true, user: result.user, isAdmin: isAdminEmail(result.user.email) });
  });

  app.get("/api/auth/session", async (c) => {
    const user = await getSession(c);
    return c.json({ user, isAdmin: user ? isAdminEmail(user.email) : false });
  });

  app.post("/api/auth/logout", async (c) => {
    await logout(c);
    return c.json({ ok: true });
  });
}
