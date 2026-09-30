// notify: sends emails via Resend for guest activity (couple alerts +
// guest-facing confirmations), plus a daily digest and a "message all
// guests" broadcast. Dormant-safe: if RESEND_API_KEY is missing, every
// call returns 200 and does nothing — it must never be a reason a guest
// submission fails, and guest-triggered calls are always fire-and-forget
// from the browser (a bare fetch().catch(() => {})).
//
// POST bodies:
//   { "kind": "rsvp_submitted" | "tree_submitted" | "blessing_submitted", "summary": "...", "adminPath": "rsvp-admin.html" }
//     -> ops alert to NOTIFY_TO (couple)
//   { "kind": "blessing_thanks", "email": "..." }
//     -> guest-facing thank-you; name/message ignored and rebuilt from the
//        newest blessings row for that email in the last 10 minutes; one
//        send per row, capped at 5/email/hour
//   { "kind": "rsvp_confirmation", "email": "..." }
//     -> guest-facing RSVP confirmation; name/summary ignored and rebuilt
//        from the newest rsvps row for that email in the last 10 minutes;
//        one send per row, capped at 5/email/hour
//   { "kind": "message_all", "adminPw": "...", "subject": "...", "html": "...", "text": "...", "test": true|false }
//     -> admin broadcast; test=true sends only to NOTIFY_TO; otherwise to
//        every distinct RSVP email, deduped, rate-limited, logged
//   { "digest": true } with header X-Digest-Secret: <DIGEST_SECRET>
//     -> 24h activity summary

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://saifandrumaisah.com";
const FROM = "Saif & Rumaisah <hello@saifandrumaisah.com>";
const REPLY_TO = "hello@saifandrumaisah.com";

const EVENT_LABELS: Record<string, string> = {
  rsvp_submitted: "New RSVP",
  tree_submitted: "New tree submission (awaiting approval)",
  blessing_submitted: "New blessing (awaiting approval)",
  admin_lockout: "Admin login lockout",
};

// CORS: this function is only ever called from the live site's own pages
// (guest-facing fetches + the admin broadcast), so the origin is pinned
// rather than reflected/wildcarded. Applied to every response, including
// error responses and the OPTIONS preflight.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST",
};

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function fail(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const OPS_ALERT_HOURLY_CAP = 20;
const GUEST_FACING_HOURLY_CAP = 5;

function minutesAgoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// Ops alerts (rsvp_submitted / tree_submitted / blessing_submitted /
// admin_lockout) only ever fire off the back of a real, recent row in
// activity_log — never from an arbitrary POST body alone.
async function hasRecentActivity(sb: ReturnType<typeof createClient>, kind: string): Promise<boolean> {
  const { data } = await sb
    .from("activity_log")
    .select("id")
    .eq("kind", kind)
    .gte("created_at", minutesAgoIso(TEN_MINUTES_MS))
    .limit(1);
  return !!(data && data.length);
}

async function opsAlertsOverCap(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { count } = await sb
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .like("kind", "couple_alert_%")
    .gte("created_at", minutesAgoIso(ONE_HOUR_MS));
  return (count ?? 0) >= OPS_ALERT_HOURLY_CAP;
}

// Guest-facing kinds (blessing_thanks / rsvp_confirmation) are capped per
// recipient regardless of dedupe-by-row, so a burst of legitimate-looking
// rows for one address still can't turn into an email flood.
async function guestFacingOverCap(sb: ReturnType<typeof createClient>, email: string): Promise<boolean> {
  const { count } = await sb
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("to_email", email)
    .in("kind", ["blessing_thanks", "rsvp_confirmation"])
    .gte("created_at", minutesAgoIso(ONE_HOUR_MS));
  return (count ?? 0) >= GUEST_FACING_HOURLY_CAP;
}

async function alreadySentForRef(sb: ReturnType<typeof createClient>, kind: string, refId: string): Promise<boolean> {
  const { data } = await sb.from("email_log").select("id").eq("kind", kind).eq("ref_id", refId).limit(1);
  return !!(data && data.length);
}

// The newest rsvps row for this contact in the last 10 minutes — the
// email body is built entirely from this row, never from request text,
// so a caller can't forge an arbitrary confirmation summary.
async function findRecentRsvp(sb: ReturnType<typeof createClient>, contact: string) {
  const { data } = await sb
    .from("rsvps")
    .select("*")
    .eq("contact", contact)
    .gte("created_at", minutesAgoIso(TEN_MINUTES_MS))
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length ? data[0] : null;
}

// Same pattern against blessings, keyed by email.
async function findRecentBlessing(sb: ReturnType<typeof createClient>, email: string) {
  const { data } = await sb
    .from("blessings")
    .select("*")
    .eq("email", email)
    .gte("created_at", minutesAgoIso(TEN_MINUTES_MS))
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length ? data[0] : null;
}

function rsvpRowSummary(row: Record<string, unknown>): string {
  const name = String(row.name || "");
  if (!row.attending) return `${name} can't make it`;
  const adults = Number(row.adults || 0);
  const children = Number(row.children || 0);
  let s = `${name} RSVP'd (${adults} adult${adults === 1 ? "" : "s"}`;
  if (children > 0) s += `, ${children} child${children === 1 ? "" : "ren"}`;
  if (row.likelihood) s += `, ${row.likelihood}`;
  s += ")";
  return s;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(full: unknown): string {
  const s = String(full ?? "").trim();
  if (!s) return "there";
  return s.split(/\s+/)[0];
}

const WRAPPER_OPEN =
  '<div style="background:#f7f1e6;padding:32px 16px;font-family:\'Cormorant Garamond\',Georgia,\'Times New Roman\',serif;color:#3b332a;">' +
  '<div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid rgba(185,150,104,0.35);border-radius:14px;padding:36px 28px;">' +
  '<div style="text-align:center;margin-bottom:8px;">' +
  '<span style="display:inline-block;width:46px;height:46px;line-height:46px;border-radius:50%;background:#b98e5a;color:#fffdf8;font-family:Georgia,serif;font-weight:600;letter-spacing:1px;">S&middot;R</span>' +
  "</div>";
const GOLD_DIVIDER =
  '<div style="height:1px;margin:22px 0;background:linear-gradient(90deg,transparent,rgba(185,150,104,0.55),transparent);"></div>';
const WRAPPER_CLOSE =
  GOLD_DIVIDER +
  '<p style="text-align:center;font-size:0.85rem;color:#8a7f6f;margin:0;">&mdash; two families, one story &mdash;<br>saifandrumaisah.com</p>' +
  "</div></div>";

function nameHeading(text: string): string {
  return `<p style="font-family:'Pinyon Script',cursive;font-size:1.8rem;color:#b98e5a;margin:0 0 6px;">${escapeHtml(text)}</p>`;
}

function blessingThanksEmail(name: string, message: string) {
  const fn = firstName(name);
  const subject = `Your words found their way to us, ${fn}`;
  const text = [
    `Dear ${fn},`,
    "",
    "Your blessing arrived — and we read it together, slowly, twice.",
    "",
    `"${String(message || "").trim()}"`,
    "",
    "There's something about seeing the words of someone we love, written just for us, that we'll carry with us long after July. Thank you for taking a moment out of your day to give us something so precious.",
    "",
    "We're keeping every blessing safe, and yours will be part of the story we look back on for the rest of our lives.",
    "",
    "With all our love and gratitude,",
    "Saif & Rumaisah",
    "",
    "— two families, one story —",
    "saifandrumaisah.com",
  ].join("\n");
  const html =
    WRAPPER_OPEN +
    nameHeading(`Dear ${fn},`) +
    '<p style="line-height:1.7;margin:0 0 14px;">Your blessing arrived &mdash; and we read it together, slowly, twice.</p>' +
    '<blockquote style="margin:0 0 14px;padding:14px 18px;border-left:3px solid #b98e5a;background:#f7f1e6;font-style:italic;">&ldquo;' +
    escapeHtml(message) +
    "&rdquo;</blockquote>" +
    '<p style="line-height:1.7;margin:0 0 14px;">There&rsquo;s something about seeing the words of someone we love, written just for us, that we&rsquo;ll carry with us long after July. Thank you for taking a moment out of your day to give us something so precious.</p>' +
    '<p style="line-height:1.7;margin:0 0 14px;">We&rsquo;re keeping every blessing safe, and yours will be part of the story we look back on for the rest of our lives.</p>' +
    '<p style="line-height:1.7;margin:0;">With all our love and gratitude,<br><strong>Saif &amp; Rumaisah</strong></p>' +
    WRAPPER_CLOSE;
  return { subject, html, text };
}

function rsvpConfirmationEmail(name: string, summary: string) {
  const fn = firstName(name);
  const subject = `We've got your reply, ${fn}`;
  const text = [
    `Dear ${fn},`,
    "",
    "Thank you for letting us know — here's what we've got down for you:",
    "",
    String(summary || ""),
    "",
    "A gentle reminder: everyone books and pays for their own flights and rooms — the site has the details as they firm up.",
    "",
    "Egypt · July 2027 — the rest is still sealed.",
    "",
    "With love,",
    "Saif & Rumaisah",
  ].join("\n");
  const html =
    WRAPPER_OPEN +
    nameHeading(`Dear ${fn},`) +
    '<p style="line-height:1.7;margin:0 0 14px;">Thank you for letting us know &mdash; here&rsquo;s what we&rsquo;ve got down for you:</p>' +
    `<p style="line-height:1.7;margin:0 0 14px;padding:12px 16px;background:#f7f1e6;border-radius:8px;">${escapeHtml(summary)}</p>` +
    '<p style="line-height:1.7;margin:0 0 14px;">A gentle reminder: everyone books and pays for their own flights and rooms &mdash; the site has the details as they firm up.</p>' +
    '<p style="line-height:1.7;margin:0 0 14px;font-style:italic;">Egypt &middot; July 2027 &mdash; the rest is still sealed.</p>' +
    '<p style="line-height:1.7;margin:0;">With love,<br><strong>Saif &amp; Rumaisah</strong></p>' +
    WRAPPER_CLOSE;
  return { subject, html, text };
}

function coupleAlertEmail(title: string, detail: string, adminUrl: string) {
  const html =
    WRAPPER_OPEN +
    `<p style="font-size:1.1rem;margin:0 0 14px;">${escapeHtml(title)}</p>` +
    `<p style="line-height:1.7;margin:0 0 18px;">${escapeHtml(detail)}</p>` +
    `<p style="margin:0;"><a href="${escapeHtml(adminUrl)}" style="color:#b98e5a;">Open the admin page &rarr;</a></p>` +
    WRAPPER_CLOSE;
  const text = `${detail}\n\n${adminUrl}`;
  return { subject: title, html, text };
}

async function sendEmail(apiKey: string, to: string[], subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, reply_to: REPLY_TO, subject, html, text }),
  });
  let providerId: string | null = null;
  try {
    const body = await res.json();
    providerId = body?.id ?? null;
  } catch {
    // ignore
  }
  return { ok: res.ok, providerId, status: res.status };
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

async function logEmail(toEmail: string, kind: string, status: string, providerId: string | null, error: string | null, refId: string | null) {
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("email_log").insert({
      to_email: toEmail.slice(0, 320),
      kind,
      status,
      provider_id: providerId,
      error: error ? String(error).slice(0, 500) : null,
      ref_id: refId,
    });
  } catch {
    // logging must never break the caller
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const notifyTo = Deno.env.get("NOTIFY_TO") || "hello@saifandrumaisah.com";
    const toList = notifyTo.split(",").map((s) => s.trim()).filter(Boolean);

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const digestSecret = Deno.env.get("DIGEST_SECRET");
    const isDigestRequest = payload.digest === true || req.headers.get("X-Digest-Secret");
    if (isDigestRequest) {
      if (!apiKey) return ok({ ok: true, sent: false, reason: "notifications not configured" });
      if (!digestSecret || req.headers.get("X-Digest-Secret") !== digestSecret) {
        return fail({ ok: false, error: "unauthorized" }, 401);
      }
      return await sendDigest(apiKey, toList);
    }

    const kind = typeof payload.kind === "string" ? payload.kind : "";

    // Dormant until the key exists — every non-digest path below is a no-op.
    if (!apiKey) {
      return ok({ ok: true, sent: false, reason: "notifications not configured" });
    }

    if (kind === "blessing_thanks") {
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (!email) return ok({ ok: true, sent: false, reason: "no email given" });
      const sb = supabaseAdmin();
      if (!sb) return ok({ ok: true, sent: false, reason: "no service credentials" });

      const row = await findRecentBlessing(sb, email);
      if (!row) return ok({ ok: true, sent: false, reason: "no matching blessing in the last 10 minutes" });

      if (await alreadySentForRef(sb, "blessing_thanks", String(row.id))) {
        return ok({ ok: true, sent: false, reason: "already thanked for this blessing" });
      }
      if (await guestFacingOverCap(sb, email)) {
        return ok({ ok: true, sent: false, reason: "rate limited" });
      }

      // Body built entirely from the DB row — request text (name/message)
      // is ignored so a caller can't forge an arbitrary thank-you email.
      const { subject, html, text } = blessingThanksEmail(String(row.name || ""), String(row.message || ""));
      const res = await sendEmail(apiKey, [email], subject, html, text);
      await logEmail(email, "blessing_thanks", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, String(row.id));
      return ok({ ok: true, sent: res.ok });
    }

    if (kind === "rsvp_confirmation") {
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (!email) return ok({ ok: true, sent: false, reason: "no email given" });
      const sb = supabaseAdmin();
      if (!sb) return ok({ ok: true, sent: false, reason: "no service credentials" });

      const row = await findRecentRsvp(sb, email);
      if (!row) return ok({ ok: true, sent: false, reason: "no matching rsvp in the last 10 minutes" });

      if (await alreadySentForRef(sb, "rsvp_confirmation", String(row.id))) {
        return ok({ ok: true, sent: false, reason: "already sent for this rsvp" });
      }
      if (await guestFacingOverCap(sb, email)) {
        return ok({ ok: true, sent: false, reason: "rate limited" });
      }

      // Name and summary rebuilt from the DB row — request text is ignored.
      const summary = rsvpRowSummary(row);
      const { subject, html, text } = rsvpConfirmationEmail(String(row.name || ""), summary);
      const res = await sendEmail(apiKey, [email], subject, html, text);
      await logEmail(email, "rsvp_confirmation", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, String(row.id));
      return ok({ ok: true, sent: res.ok });
    }

    if (kind === "message_all") {
      return await handleMessageAll(apiKey, payload);
    }

    // Plain ops alert to the couple (rsvp_submitted / tree_submitted / blessing_submitted / admin_lockout)
    const summary = typeof payload.summary === "string" ? payload.summary.slice(0, 300) : "";
    if (!kind || !summary) return ok({ ok: true, sent: false, reason: "missing kind/summary" });
    if (toList.length === 0) return ok({ ok: true, sent: false, reason: "NOTIFY_TO empty" });

    const sb = supabaseAdmin();
    if (!sb) return ok({ ok: true, sent: false, reason: "no service credentials" });
    if (!(await hasRecentActivity(sb, kind))) {
      return ok({ ok: true, sent: false, reason: "no matching activity_log row in the last 10 minutes" });
    }
    if (await opsAlertsOverCap(sb)) {
      return ok({ ok: true, sent: false, reason: "rate limited" });
    }

    const label = EVENT_LABELS[kind] || kind;
    const adminPath = typeof payload.adminPath === "string" ? payload.adminPath : "admin-activity.html";
    const emoji = kind === "blessing_submitted" ? "💌 " : "";
    const { subject, html, text } = coupleAlertEmail(`${emoji}${label}`, summary, `${SITE}/${adminPath}`);
    const alertKind =
      kind === "blessing_submitted"
        ? "couple_alert_blessing"
        : kind === "rsvp_submitted"
          ? "couple_alert_rsvp"
          : kind === "admin_lockout"
            ? "couple_alert_lockout"
            : "couple_alert_tree";
    const res = await sendEmail(apiKey, toList, subject, html, text);
    await logEmail(toList.join(","), alertKind, res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, null);
    return ok({ ok: true, sent: res.ok });
  } catch (err) {
    // Never throw — a broken notify must never surface as an error to a
    // guest-facing caller.
    return ok({ ok: true, sent: false, reason: String(err) });
  }
});

// admin-only broadcast: verifies the admin password via admin_check before
// doing anything, always sends a test copy path (test:true) with no writes
// to guests, and only ever sends to the real list on an explicit non-test call.
async function handleMessageAll(apiKey: string, payload: Record<string, unknown>): Promise<Response> {
  const sb = supabaseAdmin();
  if (!sb) return ok({ ok: true, sent: false, reason: "no service credentials" });

  const pw = typeof payload.adminPw === "string" ? payload.adminPw : "";
  const { data: authOk, error: authErr } = await sb.rpc("admin_check", { pw });
  if (authErr || !authOk) {
    return fail({ ok: false, error: "unauthorized" }, 401);
  }

  const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 200) : "";
  const html = typeof payload.html === "string" ? payload.html : "";
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!subject || !html) return ok({ ok: false, sent: false, reason: "missing subject/html" });

  const isTest = payload.test === true;
  const notifyTo = (Deno.env.get("NOTIFY_TO") || "hello@saifandrumaisah.com").split(",").map((s) => s.trim()).filter(Boolean);

  if (isTest) {
    const res = await sendEmail(apiKey, notifyTo, `[TEST] ${subject}`, html, text);
    await logEmail(notifyTo.join(","), "message_all", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, null);
    return ok({ ok: true, sent: res.ok, test: true });
  }

  const { data: rows, error } = await sb.rpc("admin_list_rsvp_emails", { pw });
  if (error) return ok({ ok: false, sent: false, reason: String(error.message || error) });
  const emails = Array.from(
    new Set((rows || []).map((r: { contact: string }) => String(r.contact || "").trim().toLowerCase()).filter(Boolean)),
  );

  let sentCount = 0;
  for (const email of emails) {
    const res = await sendEmail(apiKey, [email], subject, html, text);
    await logEmail(email, "message_all", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, null);
    if (res.ok) sentCount++;
    // gentle rate limit — stay well under Resend's per-second cap
    await new Promise((r) => setTimeout(r, 150));
  }
  return ok({ ok: true, sent: true, count: emails.length, sentCount });
}

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

  const sendRes = await sendEmail(apiKey, toList, "Daily digest — Saif & Rumaisah's wedding site", lines.join("<br>"), lines.join("\n"));
  return ok({ ok: true, sent: sendRes.ok, count: rows.length });
}
