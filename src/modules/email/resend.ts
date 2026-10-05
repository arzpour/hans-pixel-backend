import { allowedOrigins, emailFrom, isProduction, resendApiKey } from "../../config/env";

function signInLink(email: string, code: string) {
  const origin = (allowedOrigins()[0] ?? "http://localhost:3000").replace(/\/$/, "");
  const params = new URLSearchParams({ email, code });
  return `${origin}/account?${params.toString()}`;
}

function resendMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message?.trim()) return parsed.message.trim();
  } catch {
    // Resend sometimes returns plain text.
  }
  const text = body.replace(/\s+/g, " ").trim();
  return text.slice(0, 240) || "The email service rejected the message.";
}

const SEND_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendSignInCode(email: string, code: string) {
  const key = resendApiKey();
  const link = signInLink(email, code);
  if (!key) {
    if (isProduction()) {
      return { ok: false as const, error: "Email is not configured." };
    }
    console.info(`[hans-pixel] sign-in code for ${email}: ${code}`);
    return { ok: true as const, delivered: false as const };
  }

  const from = emailFrom();
  const body = JSON.stringify({
    from,
    to: [email],
    subject: "Your Hans Pixel sign-in code",
    text: `Your Hans Pixel code is ${code}.\n\nIt expires in 10 minutes. Open this link and the code is entered for you:\n${link}\n\nIf you did not ask for this, ignore this email.`,
    html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111">Your Hans Pixel code is</p><p style="font-family:Helvetica,Arial,sans-serif;font-size:32px;letter-spacing:0.28em;font-weight:600;color:#111">${code}</p><p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111"><a href="${link}">Enter this code for me</a></p><p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#444">It expires in 10 minutes. If you did not ask for this, ignore this email.</p>`,
  });
  let lastError = "The email service could not be reached. Try again.";

  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `sign-in-${code}-${email}`,
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return { ok: true as const, delivered: true as const };
      const detail = await response.text();
      lastError = resendMessage(detail);
      if (response.status !== 429 && response.status < 500) break;
    } catch {
      lastError = "The email service could not be reached. Try again.";
    }
    if (attempt < SEND_ATTEMPTS - 1) await wait(400 * (attempt + 1));
  }

  return { ok: false as const, error: lastError };
}
