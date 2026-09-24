(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EmailTemplates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Shared HTML escaping — every piece of guest-supplied text (name,
  // message, dietary notes, etc.) goes through this before it's ever
  // interpolated into an email's HTML body.
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function firstName(fullName) {
    var s = String(fullName || "").trim();
    if (!s) { return "there"; }
    return s.split(/\s+/)[0];
  }

  var WRAPPER_OPEN =
    '<div style="background:#f7f1e6;padding:32px 16px;font-family:\'Cormorant Garamond\',Georgia,\'Times New Roman\',serif;color:#3b332a;">' +
    '<div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid rgba(185,150,104,0.35);border-radius:14px;padding:36px 28px;">' +
    '<div style="text-align:center;margin-bottom:8px;">' +
    '<span style="display:inline-block;width:46px;height:46px;line-height:46px;border-radius:50%;background:#b98e5a;color:#fffdf8;font-family:Georgia,serif;font-weight:600;letter-spacing:1px;">S&middot;R</span>' +
    "</div>";
  var GOLD_DIVIDER =
    '<div style="height:1px;margin:22px 0;background:linear-gradient(90deg,transparent,rgba(185,150,104,0.55),transparent);"></div>';
  var WRAPPER_CLOSE =
    GOLD_DIVIDER +
    '<p style="text-align:center;font-size:0.85rem;color:#8a7f6f;margin:0;">&mdash; two families, one story &mdash;<br>saifandrumaisah.com</p>' +
    "</div></div>";

  function nameHeading(text) {
    return '<p style="font-family:\'Pinyon Script\',cursive;font-size:1.8rem;color:#b98e5a;margin:0 0 6px;">' + escapeHtml(text) + "</p>";
  }

  // B.3 — blessing thank-you, exact copy from the spec.
  function blessingThanksEmail(name, message) {
    var fn = escapeHtml(firstName(name));
    var subject = "Your words found their way to us, " + firstName(name);
    var textLines = [
      "Dear " + firstName(name) + ",",
      "",
      "Your blessing arrived — and we read it together, slowly, twice.",
      "",
      '"' + String(message || "").trim() + '"',
      "",
      "There's something about seeing the words of someone we love, written just for us, that we'll carry with us long after July. Thank you for taking a moment out of your day to give us something so precious.",
      "",
      "We're keeping every blessing safe, and yours will be part of the story we look back on for the rest of our lives.",
      "",
      "With all our love and gratitude,",
      "Saif & Rumaisah",
      "",
      "— two families, one story —",
      "saifandrumaisah.com"
    ];
    var html =
      WRAPPER_OPEN +
      nameHeading("Dear " + fn + ",") +
      '<p style="line-height:1.7;margin:0 0 14px;">Your blessing arrived &mdash; and we read it together, slowly, twice.</p>' +
      '<blockquote style="margin:0 0 14px;padding:14px 18px;border-left:3px solid #b98e5a;background:#f7f1e6;font-style:italic;">&ldquo;' +
      escapeHtml(message) +
      "&rdquo;</blockquote>" +
      '<p style="line-height:1.7;margin:0 0 14px;">There&rsquo;s something about seeing the words of someone we love, written just for us, that we&rsquo;ll carry with us long after July. Thank you for taking a moment out of your day to give us something so precious.</p>' +
      '<p style="line-height:1.7;margin:0 0 14px;">We&rsquo;re keeping every blessing safe, and yours will be part of the story we look back on for the rest of our lives.</p>' +
      '<p style="line-height:1.7;margin:0;">With all our love and gratitude,<br><strong>Saif &amp; Rumaisah</strong></p>' +
      WRAPPER_CLOSE;
    return { subject: subject, html: html, text: textLines.join("\n") };
  }

  // A.4 — RSVP confirmation.
  function rsvpConfirmationEmail(name, summary) {
    var fn = escapeHtml(firstName(name));
    var subject = "We've got your reply, " + firstName(name);
    var textLines = [
      "Dear " + firstName(name) + ",",
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
      "Saif & Rumaisah"
    ];
    var html =
      WRAPPER_OPEN +
      nameHeading("Dear " + fn + ",") +
      '<p style="line-height:1.7;margin:0 0 14px;">Thank you for letting us know &mdash; here&rsquo;s what we&rsquo;ve got down for you:</p>' +
      '<p style="line-height:1.7;margin:0 0 14px;padding:12px 16px;background:#f7f1e6;border-radius:8px;">' + escapeHtml(summary) + "</p>" +
      '<p style="line-height:1.7;margin:0 0 14px;">A gentle reminder: everyone books and pays for their own flights and rooms &mdash; the site has the details as they firm up.</p>' +
      '<p style="line-height:1.7;margin:0 0 14px;font-style:italic;">Egypt &middot; July 2027 &mdash; the rest is still sealed.</p>' +
      '<p style="line-height:1.7;margin:0;">With love,<br><strong>Saif &amp; Rumaisah</strong></p>' +
      WRAPPER_CLOSE;
    return { subject: subject, html: html, text: textLines.join("\n") };
  }

  // A.5 — internal alerts to the couple. adminUrl only ever points at an
  // admin page (still password-gated); never a guest-facing link.
  function coupleAlertEmail(kind, detailText, adminUrl) {
    var titles = {
      blessing: "A new blessing",
      rsvp: "A new RSVP",
      tree: "A new tree submission"
    };
    var emoji = kind === "blessing" ? "💌 " : "";
    var title = emoji + (titles[kind] || "New activity") + (kind === "blessing" ? "" : "");
    var subject = title;
    var text = detailText + "\n\n" + adminUrl;
    var html =
      WRAPPER_OPEN +
      '<p style="font-size:1.1rem;margin:0 0 14px;">' + escapeHtml(title) + "</p>" +
      '<p style="line-height:1.7;margin:0 0 18px;">' + escapeHtml(detailText) + "</p>" +
      '<p style="margin:0;"><a href="' + escapeHtml(adminUrl) + '" style="color:#b98e5a;">Open the admin page &rarr;</a></p>' +
      WRAPPER_CLOSE;
    return { subject: subject, html: html, text: text };
  }

  // B.2 — lightweight theme classifier, mirrors the DB trigger's keyword
  // logic (kept here too so the admin UI can preview/override consistently
  // and so it's independently unit-testable).
  function classifyTheme(text) {
    var s = String(text || "").toLowerCase();
    if (/congrat|mubarak|masha ?allah|mashallah/.test(s)) { return "congratulations"; }
    if (/can'?t wait|cannot wait|so excited|counting down|so ready/.test(s)) { return "cant_wait"; }
    if (/will be there|see you there|can'?t make it|wish(ing)? (i|we) could|sadly|unfortunately/.test(s)) { return "will_be_there"; }
    if (/dua|pray|ameen|amin|allah|barakah|barakat|blessing/.test(s)) { return "duas"; }
    return "love";
  }

  var THEME_LABELS = {
    congratulations: "congratulations",
    cant_wait: "can't wait",
    will_be_there: "will be there",
    duas: "duas & prayers",
    love: "love"
  };

  // B.1 mirror — client/admin-side moderation preview only; the DB trigger
  // is the source of truth (this never gates what actually saves).
  var BAD_WORDS = /(fuck|shit|bitch|asshole|bastard|cunt|whore|slut|rape|kill yourself|kys|randi|chutiya|harami|madarchod|behenchod|bhosdi|gandu|kanjar|sharmuta)/i;
  function moderationFlags(name, message) {
    var reasons = [];
    var msg = String(message || "");
    if (/https?:\/\/|www\.|\.com|\.co\.uk|\.net\b/i.test(msg)) { reasons.push("link"); }
    if (/[0-9][0-9 \-().]{7,}[0-9]/.test(msg)) { reasons.push("phone-like number"); }
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(msg)) { reasons.push("email address"); }
    if (BAD_WORDS.test(name + " " + msg)) { reasons.push("profanity/abusive term"); }
    if (msg.length >= 12 && msg === msg.toUpperCase() && /[A-Za-z]/.test(msg)) { reasons.push("all-caps"); }
    if (/(.)\1{5,}/i.test(msg)) { reasons.push("repeated characters"); }
    return { held: reasons.length > 0, reasons: reasons };
  }

  // Dedupe + normalize a list of email addresses for "message all guests".
  function dedupeEmails(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (raw) {
      var e = String(raw || "").trim().toLowerCase();
      if (!e || seen[e]) { return; }
      seen[e] = true;
      out.push(e);
    });
    return out;
  }

  return {
    escapeHtml: escapeHtml,
    firstName: firstName,
    blessingThanksEmail: blessingThanksEmail,
    rsvpConfirmationEmail: rsvpConfirmationEmail,
    coupleAlertEmail: coupleAlertEmail,
    classifyTheme: classifyTheme,
    THEME_LABELS: THEME_LABELS,
    moderationFlags: moderationFlags,
    dedupeEmails: dedupeEmails
  };
});
