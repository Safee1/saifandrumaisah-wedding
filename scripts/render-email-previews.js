// Renders every guest-facing / admin email template to a static HTML file
// under docs/email-previews/, using the same templating module the edge
// function's logic mirrors (js/email-templates.js). Run with:
//   node scripts/render-email-previews.js
"use strict";

const fs = require("fs");
const path = require("path");
const Email = require("../js/email-templates.js");

const outDir = path.join(__dirname, "..", "docs", "email-previews");
fs.mkdirSync(outDir, { recursive: true });

function write(name, html) {
  fs.writeFileSync(path.join(outDir, name), html, "utf8");
  console.log("wrote", name);
}

var blessing = Email.blessingThanksEmail(
  "Auntie Asma",
  "May Allah bless your union with endless happiness, patience and love. So proud of you both."
);
write("blessing-thanks.html", blessing.html);

var rsvp = Email.rsvpConfirmationEmail(
  "Zainab Khan",
  "2 adults, 1 child — definitely coming, no dietary requirements."
);
write("rsvp-confirmation.html", rsvp.html);

var alertBlessing = Email.coupleAlertEmail(
  "💌 A new blessing",
  "From Auntie Asma — awaiting your review",
  "https://saifandrumaisah.com/admin-activity.html"
);
write("couple-alert-blessing.html", alertBlessing.html);

var alertRsvp = Email.coupleAlertEmail(
  "A new RSVP",
  "Zainab Khan RSVP'd (2 adults, 1 child, definitely)",
  "https://saifandrumaisah.com/rsvp-admin.html"
);
write("couple-alert-rsvp.html", alertRsvp.html);

var alertTree = Email.coupleAlertEmail(
  "A new tree submission",
  "Kashif added himself to the family tree — awaiting your review",
  "https://saifandrumaisah.com/tree-admin.html"
);
write("couple-alert-tree.html", alertTree.html);

console.log("Done — " + outDir);
