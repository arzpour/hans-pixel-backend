import { createHash, timingSafeEqual } from "crypto";
import { authSecret } from "../../config/env";

export function hashSecret(value: string) {
  return createHash("sha256").update(`${authSecret()}:${value}`).digest("hex");
}

export function hashesMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
