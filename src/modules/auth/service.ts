import { randomBytes, randomInt } from "crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR, SESSION_TTL_MS } from "../../config/limits";
import { getDb } from "../../db/client";
import { emailCodes, sessions, users } from "../../db/schema";
import type { SessionUser } from "../../types/session";
import { sendSignInCode } from "../email/resend";
import { clearSessionCookie, readSessionToken } from "./cookies";
import { hashSecret, hashesMatch } from "./crypto";
import { normalizeNameKey } from "./identity";

export async function getSession(c: Context): Promise<SessionUser | null> {
  const token = readSessionToken(c);
  if (!token) return null;

  const db = await getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashSecret(token)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now() || !row.emailVerifiedAt) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  return { id: row.userId, email: row.email, name: row.name, phone: row.phone, verified: true };
}

function sessionUser(user: { id: string; email: string; name: string | null; phone: string | null }) {
  return { id: user.id, email: user.email, name: user.name, phone: user.phone, verified: true as const };
}

export async function signupConflict(email: string, name: string, phone: string, exceptUserId?: string) {
  const db = await getDb();
  const nameKey = normalizeNameKey(name);
  const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (byEmail && byEmail.id !== exceptUserId) {
    return { ok: false as const, status: 409 as const, error: "An account already uses this email." };
  }
  if (nameKey) {
    const [byName] = await db.select({ id: users.id }).from(users).where(eq(users.nameKey, nameKey)).limit(1);
    if (byName && byName.id !== exceptUserId) {
      return { ok: false as const, status: 409 as const, error: "An account already uses this name." };
    }
  }
  const [byPhone] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (byPhone && byPhone.id !== exceptUserId) {
    return { ok: false as const, status: 409 as const, error: "An account already uses this mobile number." };
  }
  return { ok: true as const, nameKey };
}

export async function saveMobile(userId: string, phone: string) {
  const db = await getDb();
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (taken && taken.id !== userId) {
    return { ok: false as const, status: 409 as const, error: "An account already uses this mobile number." };
  }
  const [updated] = await db.update(users).set({ phone }).where(eq(users.id, userId)).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    phone: users.phone,
  });
  if (!updated) return { ok: false as const, status: 401 as const, error: "Sign in before you save a mobile number." };
  return { ok: true as const, user: sessionUser(updated) };
}

export async function requestSignInCode(email: string) {
  const db = await getDb();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailCodes)
    .where(and(eq(emailCodes.email, email), gt(emailCodes.createdAt, since)));

  if (Number(recent?.count ?? 0) >= MAX_CODES_PER_HOUR) {
    const [oldest] = await db
      .select({ createdAt: emailCodes.createdAt })
      .from(emailCodes)
      .where(and(eq(emailCodes.email, email), gt(emailCodes.createdAt, since)))
      .orderBy(asc(emailCodes.createdAt))
      .limit(1);
    const waitMs = oldest ? oldest.createdAt.getTime() + 60 * 60 * 1000 - Date.now() : 60 * 60 * 1000;
    const minutes = Math.max(1, Math.ceil(waitMs / 60000));
    return {
      ok: false as const,
      status: 429 as const,
      error: `Five codes already went to this email in the last hour. Ask again in ${minutes} minutes.`,
    };
  }

  await db
    .update(emailCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt)));

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [inserted] = await db
    .insert(emailCodes)
    .values({
      email,
      codeHash: hashSecret(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    })
    .returning({ id: emailCodes.id });

  const delivery = await sendSignInCode(email, code);
  if (!delivery.ok) {
    if (inserted) await db.delete(emailCodes).where(eq(emailCodes.id, inserted.id));
    return { ok: false as const, status: 502 as const, error: delivery.error };
  }
  return {
    ok: true as const,
    devCode: delivery.delivered ? undefined : code,
  };
}

export async function verifySignInCode(email: string, code: string, name?: string, phone?: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt), gt(emailCodes.expiresAt, new Date())))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  if (!row) {
    return { ok: false as const, status: 401 as const, error: "That code is not right, or it expired. Ask for a new one." };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false as const, status: 401 as const, error: "Too many tries. Ask for a new code." };
  }

  const [updated] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(eq(emailCodes.id, row.id))
    .returning({ attempts: emailCodes.attempts });

  if (!hashesMatch(row.codeHash, hashSecret(code))) {
    if (Number(updated?.attempts ?? row.attempts + 1) >= MAX_CODE_ATTEMPTS) {
      return { ok: false as const, status: 401 as const, error: "Too many tries. Ask for a new code." };
    }
    return { ok: false as const, status: 401 as const, error: "That code is not right." };
  }

  const signingUp = Boolean(name && phone);
  let nameKey = name ? normalizeNameKey(name) : "";
  if (signingUp && name && phone) {
    const available = await signupConflict(email, name, phone);
    if (!available.ok) return available;
    nameKey = available.nameKey;
  }

  await db.update(emailCodes).set({ consumedAt: new Date() }).where(eq(emailCodes.id, row.id));

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existing;
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: name || null,
        nameKey: nameKey || null,
        phone: phone || null,
        emailVerifiedAt: new Date(),
      })
      .returning();
    user = created;
  } else if (signingUp) {
    return { ok: false as const, status: 409 as const, error: "An account already uses this email." };
  } else {
    const nextName = name || user.name;
    const nextKey = nextName ? normalizeNameKey(nextName) : null;
    if (nextKey && nextKey !== user.nameKey) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.nameKey, nextKey)).limit(1);
      if (taken && taken.id !== user.id) {
        return { ok: false as const, status: 409 as const, error: "An account already uses this name." };
      }
    }
    const verifiedAt = user.emailVerifiedAt ?? new Date();
    await db
      .update(users)
      .set({ name: nextName, nameKey: nextKey, emailVerifiedAt: verifiedAt })
      .where(eq(users.id, user.id));
    user = { ...user, name: nextName, nameKey: nextKey, emailVerifiedAt: verifiedAt };
  }

  if (!user) {
    return { ok: false as const, status: 500 as const, error: "Could not open the account." };
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return {
    ok: true as const,
    token,
    user: sessionUser(user),
  };
}

export async function logout(c: Context) {
  const token = readSessionToken(c);
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSecret(token)));
  }
  clearSessionCookie(c);
}
