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
//   { "kind": "blessing_thanks", "email": "...", "name": "...", "message": "..." }
//     -> guest-facing thank-you, only if email given, max 1/email/24h
//   { "kind": "rsvp_confirmation", "email": "...", "name": "...", "summary": "..." }
//     -> guest-facing RSVP confirmation, only if email given
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

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
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
      if (sb) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await sb
          .from("email_log")
          .select("id", { count: "exact", head: true })
          .eq("to_email", email)
          .eq("kind", "blessing_thanks")
          .gte("created_at", since);
        if ((count ?? 0) > 0) {
          return ok({ ok: true, sent: false, reason: "already thanked in the last 24h" });
        }
      }
      const name = typeof payload.name === "string" ? payload.name : "";
      const message = typeof payload.message === "string" ? payload.message : "";
      const { subject, html, text } = blessingThanksEmail(name, message);
      const res = await sendEmail(apiKey, [email], subject, html, text);
      await logEmail(email, "blessing_thanks", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, null);
      return ok({ ok: true, sent: res.ok });
    }

    if (kind === "rsvp_confirmation") {
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (!email) return ok({ ok: true, sent: false, reason: "no email given" });
      const name = typeof payload.name === "string" ? payload.name : "";
      const summary = typeof payload.summary === "string" ? payload.summary : "";
      const { subject, html, text } = rsvpConfirmationEmail(name, summary);
      const res = await sendEmail(apiKey, [email], subject, html, text);
      await logEmail(email, "rsvp_confirmation", res.ok ? "sent" : "failed", res.providerId, res.ok ? null : `status ${res.status}`, null);
      return ok({ ok: true, sent: res.ok });
    }

    if (kind === "message_all") {
      return await handleMessageAll(apiKey, payload);
    }

    // Plain ops alert to the couple (rsvp_submitted / tree_submitted / blessing_submitted / admin_lockout)
    const summary = typeof payload.summary === "string" ? payload.summary.slice(0, 300) : "";
    if (!kind || !summary) return ok({ ok: true, sent: false, reason: "missing kind/summary" });
    if (toList.length === 0) return ok({ ok: true, sent: false, reason: "NOTIFY_TO empty" });

    const label = EVENT_LABELS[kind] || kind;
    const adminPath = typeof payload.adminPath === "string" ? payload.adminPath : "admin-activity.html";
    const emoji = kind === "blessing_submitted" ? "💌 " : "";
    const { subject, html, text } = coupleAlertEmail(`${emoji}${label}`, summary, `${SITE}/${adminPath}`);
    const alertKind = kind === "blessing_submitted" ? "couple_alert_blessing" : kind === "rsvp_submitted" ? "couple_alert_rsvp" : "couple_alert_tree";
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
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
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
