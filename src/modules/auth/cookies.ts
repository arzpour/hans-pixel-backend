import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cookieSameSite, isProduction } from "../../config/env";
import { SESSION_TTL_MS } from "../../config/limits";

const COOKIE = "hp_session";

function cookieOptions() {
  const sameSite = cookieSameSite();
  return {
    httpOnly: true,
    secure: sameSite === "None" || isProduction(),
    sameSite,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  } as const;
}

export function readSessionToken(c: Context) {
  return getCookie(c, COOKIE);
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, cookieOptions());
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}
