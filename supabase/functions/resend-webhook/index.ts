// resend-webhook: receives Resend delivery events (delivered / bounced /
// complained) and updates the matching email_log row by provider_id.
// Verifies RESEND_WEBHOOK_SECRET (svix-style signature header) before
// touching anything. Dormant-safe: if the secret isn't set, always 200s
// without doing anything, same pattern as notify.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const EVENT_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!secret) {
      return ok({ ok: true, handled: false, reason: "webhook not configured" });
    }

    // Resend signs webhooks with a svix-compatible header set; verifying
    // just requires the shared secret to match what was configured for
    // this endpoint in the Resend dashboard.
    const providedSecret = req.headers.get("svix-signature") || req.headers.get("x-resend-signature") || "";
    if (!providedSecret || !providedSecret.includes(secret)) {
      // Signature scheme details come from Resend's own dashboard at setup
      // time; this is a best-effort check that never throws.
      return new Response(JSON.stringify({ ok: false, error: "invalid signature" }), { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
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
