// resend-webhook: receives Resend delivery events (delivered / bounced /
// complained) and updates the matching email_log row by provider_id.
// Verifies the request with real Svix HMAC verification before touching
// anything. Dormant-safe: if the secret isn't set, always 200s without
// doing anything, same pattern as notify.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fail(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const EVENT_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

const FIVE_MINUTES_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Constant-time-ish compare: bails immediately on length mismatch (as does
// Svix's own reference verifier), otherwise XORs every byte so a match
// can't be timed out one character at a time.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Base64(secretBytes: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return bytesToBase64(new Uint8Array(sig));
}

// Real Svix verification (Resend signs webhooks the Svix way):
//   secret = base64-decode(RESEND_WEBHOOK_SECRET with the "whsec_" prefix stripped)
//   signed content = `${svix-id}.${svix-timestamp}.${rawBody}`
//   expected sig = base64(HMAC-SHA256(secret, signed content))
//   compare against every "v1,<sig>" entry in the svix-signature header
//   reject if svix-timestamp is older than 5 minutes
async function verifySvix(req: Request, rawBody: string, secretEnv: string): Promise<boolean> {
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - ts > FIVE_MINUTES_SECONDS) return false;

  const secretB64 = secretEnv.startsWith("whsec_") ? secretEnv.slice("whsec_".length) : secretEnv;
  let secretBytes: Uint8Array;
  try {
    secretBytes = base64ToBytes(secretB64);
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = await hmacSha256Base64(secretBytes, signedContent);

  const entries = svixSignature.split(/\s+/).filter(Boolean);
  for (const entry of entries) {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) continue;
    if (timingSafeEqual(sig, expectedSig)) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!secret) {
      return ok({ ok: true, handled: false, reason: "webhook not configured" });
    }

    // Read the raw body before any JSON parsing — the signed content is
    // computed over the exact bytes Resend sent, not a re-serialized copy.
    const rawBody = await req.text();

    const verified = await verifySvix(req, rawBody, secret);
    if (!verified) {
      return fail({ ok: false, error: "invalid signature" }, 401);
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return ok({ ok: true, handled: false, reason: "bad payload" });
    }

    const type = typeof payload.type === "string" ? payload.type : "";
    const status = EVENT_STATUS[type];
    if (!status) return ok({ ok: true, handled: false, reason: `unhandled event ${type}` });

    const data = (payload.data as Record<string, unknown>) || {};
    const providerId = typeof data.email_id === "string" ? data.email_id : typeof data.id === "string" ? data.id : "";
    if (!providerId) return ok({ ok: true, handled: false, reason: "no provider id" });

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return ok({ ok: true, handled: false, reason: "no service credentials" });

    const sb = createClient(url, key);
    await sb.from("email_log").update({ status }).eq("provider_id", providerId);

    return ok({ ok: true, handled: true, status });
  } catch (err) {
    return ok({ ok: true, handled: false, reason: String(err) });
  }
});
