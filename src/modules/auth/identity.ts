import { adminEmails } from "../../config/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value) && value.length <= 320;
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.toLowerCase());
}
