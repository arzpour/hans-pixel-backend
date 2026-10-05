import "dotenv/config";
import type { R2Settings } from "../types/storage";

function trimmed(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function databaseUrl() {
  const url = trimmed("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL is not set. Paste the Supabase connection string into hans pixel backend/.env");
  }
  return url;
}

export function authSecret() {
  const secret = trimmed("AUTH_SECRET");
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function port() {
  return Number(process.env.PORT || 4000);
}

export function adminEmails() {
  return trimmed("ADMIN_EMAILS")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function cookieSameSite(): "None" | "Lax" {
  return process.env.COOKIE_SAMESITE?.trim().toLowerCase() === "none" ? "None" : "Lax";
}

export function publicBaseUrl() {
  const configured = trimmed("PUBLIC_BASE_URL");
  if (configured) return configured.replace(/\/$/, "");
  return `http://localhost:${process.env.PORT || "4000"}`;
}

export function allowedOrigins() {
  const raw = trimmed("FRONTEND_ORIGIN") || "http://localhost:3000";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resendApiKey() {
  return trimmed("RESEND_API_KEY");
}

export function emailFrom() {
  return process.env.EMAIL_FROM || "Hans Pixel <orders@hanspixel.com>";
}

export function r2Settings(): R2Settings {
  const accountId = trimmed("R2_ACCOUNT_ID");
  const accessKeyId = trimmed("R2_ACCESS_KEY_ID");
  const secretAccessKey = trimmed("R2_SECRET_ACCESS_KEY");
  const bucket = trimmed("R2_BUCKET");
  const filled = [accountId, accessKeyId, secretAccessKey, bucket].filter(Boolean).length;
  if (filled === 0) return null;
  if (filled < 4) return { error: "partial" };
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function serviceStatus() {
  return {
    database: Boolean(trimmed("DATABASE_URL")),
    email: Boolean(trimmed("RESEND_API_KEY")),
    storage: Boolean(
      trimmed("R2_ACCOUNT_ID") &&
        trimmed("R2_ACCESS_KEY_ID") &&
        trimmed("R2_SECRET_ACCESS_KEY") &&
        trimmed("R2_BUCKET"),
    ),
  };
}

export function missingSignInConfig() {
  return ["DATABASE_URL", "AUTH_SECRET"].filter((key) => !trimmed(key));
}
