import { adminEmails } from "../../config/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value) && value.length <= 320;
}

export function normalizeNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeMobile(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  const international = trimmed.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;

  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (!international && /^09\d{9}$/.test(digits)) return digits;
  if (!international && /^9\d{9}$/.test(digits)) return `0${digits}`;

  if (international || !digits.startsWith("0")) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    return `+${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.toLowerCase());
}
