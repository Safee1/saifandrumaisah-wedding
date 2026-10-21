// Pure helpers for the notify function, kept in their own module so tests can
// run them under plain Node (index.ts itself needs Deno).

// Where each ops alert links to. Doubles as the list of accepted alert kinds:
// anything else is ignored, and the link never comes from the request.
export const ALERTS = {
  rsvp_submitted: "rsvp-admin.html",
  tree_submitted: "tree-admin.html",
  blessing_submitted: "admin-activity.html",
  admin_lockout: "admin-activity.html",
};

// One plain mailbox: no spaces, commas, semicolons or angle brackets, so a
// "to" value can never become several recipients or a display-name trick.
export function validRecipient(email) {
  const s = typeof email === "string" ? email : "";
  if (s.length < 6 || s.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s);
}

// Lower-case, and drop "+tag" so a+1@x and a+2@x count as one mailbox.
export function normalizeMailbox(email) {
  return String(email || "").trim().toLowerCase().replace(/\+[^@]*@/, "@");
}

// A greeting name built from letters/marks only; anything odd becomes "there".
export function safeFirstName(full) {
  const first = String(full == null ? "" : full).trim().split(/\s+/)[0] || "";
  const cleaned = first.replace(/[^\p{L}\p{M}'’-]/gu, "").slice(0, 30);
  return cleaned || "there";
}

// Only an approved, unflagged blessing may be quoted back in an email.
export function canQuoteBlessing(row) {
  return !!row && row.status === "approved" && !row.moderation_reason;
}

// A broadcast is live only on an explicit test:false; anything else is a test.
export function isTestBroadcast(payload) {
  return !(payload && payload.test === false);
}
