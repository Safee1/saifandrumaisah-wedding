// notify: sends a short ops email via Resend for guest activity, and a
// daily digest when called with the shared digest secret. Dormant-safe:
// if RESEND_API_KEY or NOTIFY_TO is missing, this always returns 200 and
// does nothing — it must never be a reason a guest submission fails, and
// it is only ever called fire-and-forget, after the guest's own insert
// has already succeeded.
//
// POST body for an event: { "kind": "rsvp_submitted", "summary": "..." }
// POST with header X-Digest-Secret: <DIGEST_SECRET> and body { "digest": true }
// triggers the 24h summary instead of a single event.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const EVENT_LABELS: Record<string, string> = {
  rsvp_submitted: "New RSVP",
  tree_submitted: "New tree submission (awaiting approval)",
  blessing_submitted: "New blessing (awaiting approval)",
  admin_lockout: "Admin login lockout",
};

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendEmail(apiKey: string, to: string[], subject: string, text: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Saif & Rumaisah's wedding site <notifications@saifandrumaisah.com>",
      to,
      subject,
      text,
    }),
  });
}

Deno.serve(async (req: Request) => {
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const notifyTo = Deno.env.get("NOTIFY_TO");

    // Dormant until both secrets exist — no-op, but still 200 so callers
    // never see this as a failure.
    if (!apiKey || !notifyTo) {
      return ok({ ok: true, sent: false, reason: "notifications not configured" });
    }
    const toList = notifyTo.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) {
      return ok({ ok: true, sent: false, reason: "NOTIFY_TO empty" });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const digestSecret = Deno.env.get("DIGEST_SECRET");
    const isDigestRequest = payload.digest === true || req.headers.get("X-Digest-Secret");
    if (isDigestRequest) {
      if (!digestSecret || req.headers.get("X-Digest-Secret") !== digestSecret) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
      }
      return await sendDigest(apiKey, toList);
    }

    const kind = typeof payload.kind === "string" ? payload.kind : "";
    const summary = typeof payload.summary === "string" ? payload.summary.slice(0, 300) : "";
    if (!kind || !summary) {
      return ok({ ok: true, sent: false, reason: "missing kind/summary" });
    }

    const label = EVENT_LABELS[kind] || kind;
    const subject = `${label} — Saif & Rumaisah's wedding site`;
    const res = await sendEmail(apiKey, toList, subject, `${summary}\n\n— sent automatically from the wedding site`);
    return ok({ ok: true, sent: res.ok });
  } catch (err) {
    // Never throw — a broken notify must never surface as an error to a
    // guest-facing caller.
    return ok({ ok: true, sent: false, reason: String(err) });
  }
});

async function sendDigest(apiKey: string, toList: string[]): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return ok({ ok: true, sent: false, reason: "no service credentials for digest" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/activity_log?select=kind,summary,created_at&created_at=gte.${since}&order=created_at.desc&limit=500`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) {
    return ok({ ok: true, sent: false, reason: "could not read activity_log" });
  }
  const rows = (await res.json()) as Array<{ kind: string; summary: string; created_at: string }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;

  const lines = [
    `Last 24 hours on the wedding site:`,
    ``,
    `New RSVPs: ${counts.rsvp_submitted || 0}`,
    `New tree submissions: ${counts.tree_submitted || 0}`,
    `New blessings: ${counts.blessing_submitted || 0}`,
    `Failed admin logins: ${counts.admin_login_failed || 0}`,
    `Lockouts: ${counts.admin_lockout || 0}`,
    ``,
    rows.length ? `${rows.length} total events — see admin-activity.html for the full timeline.` : `No activity in the last 24h.`,
  ];

  const sendRes = await sendEmail(apiKey, toList, "Daily digest — Saif & Rumaisah's wedding site", lines.join("\n"));
  return ok({ ok: true, sent: sendRes.ok, count: rows.length });
}
