import nodemailer from "nodemailer";
import { env } from "./env.js";

const REQUEST_TIMEOUT_MS = 15000;

/* MAIL_FROM looks like `SBD Solutions <hello@example.com>`. Brevo needs the
   name and address separately; Resend and SMTP take the whole string back. */
function parseFrom(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) {
    return { name: "SBD Solutions", email: raw, formatted: raw };
  }
  const name = match[1].replace(/^"|"$/g, "").trim() || "SBD Solutions";
  const email = match[2].trim();
  return { name, email, formatted: `${name} <${email}>` };
}

const from = parseFrom(env.mail.from);

const toList = (to) => (Array.isArray(to) ? to : [to]).filter(Boolean);

/* MAIL_REPLY_TO is often written by hand: a display name, several addresses or
   a stray comma makes the whole message invalid at the provider. Keep the first
   real address and drop everything else. */
function firstEmail(value) {
  const raw = String(value || "");
  const angle = raw.match(/<([^>]+)>/);
  const candidate = angle ? angle[1] : raw;
  const found = candidate.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/);
  return found ? found[0].trim() : "";
}

const cleanReplyTo = (value) => firstEmail(value) || firstEmail(env.mail.replyTo);

/* Kept in memory so /api/health can say why the last send failed without
   exposing keys, addresses or message bodies. */
const mailState = { lastSuccessAt: null, lastSuccessProvider: "", lastFailure: null };

const reasonFor = (message) => {
  const text = String(message || "");
  if (/quota|limit|credit/i.test(text)) return "quota_reached";
  if (/unauthorized|key not found|401|403/i.test(text)) return "key_rejected";
  if (/reply.?to/i.test(text)) return "reply_to_rejected";
  if (/sender|from address/i.test(text)) return "sender_not_verified";
  if (/recipient|to address|invalid email/i.test(text)) return "recipient_rejected";
  return "provider_error";
};

const sanitise = (message) =>
  String(message || "")
    .replace(/[^\s,;<>"']+@[^\s,;<>"']+/g, "[address]")
    .replace(/\s+/g, " ")
    .slice(0, 240);

export function mailStatusSnapshot() {
  return {
    lastSuccessAt: mailState.lastSuccessAt,
    lastSuccessProvider: mailState.lastSuccessProvider,
    lastFailure: mailState.lastFailure,
  };
}

let smtpTransport = null;
function smtp() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.mail.smtp.host,
      port: env.mail.smtp.port,
      secure: env.mail.smtp.secure,
      auth: env.mail.smtp.user ? { user: env.mail.smtp.user, pass: env.mail.smtp.pass } : undefined,
    });
  }
  return smtpTransport;
}

async function postJson(url, headers, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${body.slice(0, 300) || response.statusText}`);
  }
  return body;
}

/* Brevo — POST /v3/smtp/email. Authenticates with the `api-key` header. */
async function sendWithBrevo({ to, subject, text, html, replyTo }) {
  const reply = cleanReplyTo(replyTo);
  return postJson(
    env.mail.brevo.apiUrl,
    { "api-key": env.mail.brevo.apiKey },
    {
      sender: { name: from.name, email: from.email },
      to: toList(to).map((address) => ({ email: address })),
      ...(reply ? { replyTo: { email: reply } } : {}),
      subject,
      htmlContent: html,
      textContent: text,
    }
  );
}

/* Resend — POST /emails. Authenticates with a bearer token. */
async function sendWithResend({ to, subject, text, html, replyTo }) {
  const reply = cleanReplyTo(replyTo);
  return postJson(
    env.mail.resend.apiUrl,
    { authorization: `Bearer ${env.mail.resend.apiKey}` },
    {
      from: from.formatted,
      to: toList(to),
      ...(reply ? { reply_to: reply } : {}),
      subject,
      html,
      text,
    }
  );
}

async function sendWithSmtp({ to, subject, text, html, replyTo }) {
  const reply = cleanReplyTo(replyTo);
  await smtp().sendMail({
    from: from.formatted,
    to: toList(to),
    subject,
    text,
    html,
    ...(reply ? { replyTo: reply } : {}),
  });
}

const SENDERS = { brevo: sendWithBrevo, resend: sendWithResend, smtp: sendWithSmtp };
const FALLBACK_ORDER = ["brevo", "resend", "smtp"];

const isConfigured = (name) => {
  if (name === "brevo") return Boolean(env.mail.brevo.apiKey);
  if (name === "resend") return Boolean(env.mail.resend.apiKey);
  return Boolean(env.mail.smtp.host);
};

/* EMAIL_PROVIDER chooses the first attempt; the remaining configured
   providers are tried in order, so a Brevo outage still sends through Resend. */
export function emailProviders() {
  const preferred = env.mail.provider;
  const order = [];
  if (SENDERS[preferred] && isConfigured(preferred)) order.push(preferred);
  for (const name of FALLBACK_ORDER) {
    if (isConfigured(name) && !order.includes(name)) order.push(name);
  }
  return order;
}

export const emailProviderName = emailProviders()[0] || "none";

async function send({ to, subject, text, html, link, replyTo }) {
  const order = emailProviders();
  if (!order.length) {
    console.log(`[mail] No email provider configured. ${subject} -> ${to}`);
    console.log(`[mail] link: ${link}`);
    return { delivered: false, previewUrl: link };
  }

  const failures = [];
  /* Validate every recipient: one malformed entry makes the provider reject
     the whole message, so the owner notification would never arrive. */
  const recipients = [...new Set(toList(to).map(firstEmail).filter(Boolean))];
  if (!recipients.length) {
    console.error(`[mail] "${subject}" has no valid recipient — not sent.`);
    return { delivered: false, previewUrl: link, failures: ["no valid recipient address"] };
  }
  for (const name of order) {
    try {
      try {
        await SENDERS[name]({ to: recipients, subject, text, html, replyTo });
      } catch (error) {
        /* A malformed reply-to is the one field that stops an otherwise valid
           message, so retry once without it before giving up on the provider. */
        if (!cleanReplyTo(replyTo) || !/reply.?to/i.test(error.message)) throw error;
        await SENDERS[name]({ to: recipients, subject, text, html, replyTo: "" });
      }
      console.log(`[mail] "${subject}" delivered to ${recipients.join(", ")} via ${name}`);
      mailState.lastSuccessAt = new Date().toISOString();
      mailState.lastSuccessProvider = name;
      mailState.lastFailure = null;
      return { delivered: true, provider: name };
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.error(`[mail] ${name} failed for ${to} — ${error.message}`);
      mailState.lastFailure = {
        at: new Date().toISOString(),
        provider: name,
        reason: reasonFor(error.message),
        detail: sanitise(error.message),
      };
    }
  }

  console.error(`[mail] every provider failed for ${to} — ${failures.join(" | ")}`);
  return { delivered: false, previewUrl: link, failures };
}

/* Used by the operator dashboard to prove the sending account works. */
export async function sendTestEmail(to) {
  const subject = "SBD Solutions test email";
  const text = "This is a test message from the SBD Solutions platform. If you can read it, verification and password-reset email will reach customers too.";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0b1220"><h2 style="color:#0b1f3f">Test email</h2><p>${text}</p></div>`;
  return send({ to, subject, text, html, link: "" });
}

/* Notification to the business inbox when a project enquiry is submitted. The
   enquiry is already stored before this runs, so a failure here never loses it. */
export function sendProjectEnquiryEmail(enquiry, to) {
  const escape = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const currency = enquiry.starting_price_currency || enquiry.currency;
  const price =
    currency === "NGN"
      ? `NGN ${Number(enquiry.starting_price_amount || 0).toLocaleString("en-NG")}`
      : `USD ${Number(enquiry.starting_price_amount || 0).toLocaleString("en-US")}`;
  const reference = `SBD-${String(enquiry.id).slice(0, 8).toUpperCase()}`;
  const subject = `New project enquiry — ${enquiry.serviceName} (${reference})`;

  const lines = [
    [`Reference`, reference],
    [`Service`, enquiry.serviceName],
    [`Starting price shown`, price],
    [`Preferred currency`, enquiry.currency],
    [`Full name`, enquiry.full_name],
    [`Business name`, enquiry.business_name || "—"],
    [`Email`, enquiry.email],
    [`Phone / WhatsApp`, enquiry.phone],
    [`Estimated budget`, enquiry.estimated_budget || "—"],
    [`Submitted`, new Date(enquiry.created_at).toLocaleString("en-GB")],
  ];
  const text = [
    "A new project enquiry was submitted on the SBD Solutions website.",
    "",
    ...lines.map(([label, value]) => `${label}: ${value}`),
    "",
    "Project description:",
    enquiry.description,
    "",
    "Additional requirements:",
    enquiry.additional_requirements || "—",
    "",
    "The starting price is a development fee estimate, not a final quotation. Review the enquiry, prepare a quotation and send it to the customer before any payment is requested.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#0b1220">
      <h2 style="color:#0b1f3f;margin-bottom:4px">New project enquiry</h2>
      <p style="color:#5b6675;margin-top:0">${escape(reference)} · ${escape(enquiry.serviceName)}</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${lines
          .map(
            ([label, value]) =>
              `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675;width:42%">${escape(label)}</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;font-weight:600">${escape(value)}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="color:#0b1f3f">Project description</h3>
      <p style="white-space:pre-wrap;line-height:1.6">${escape(enquiry.description)}</p>
      <h3 style="color:#0b1f3f">Additional requirements</h3>
      <p style="white-space:pre-wrap;line-height:1.6">${escape(enquiry.additional_requirements) || "—"}</p>
      <p style="font-size:13px;color:#5b6675;border-top:1px solid #e6ecf5;padding-top:12px">
        The starting price is a development fee estimate, not a final quotation. Prepare and send a written quotation before requesting any payment. Third-party costs such as domain, hosting and API usage are separate.
      </p>
    </div>`;

  /* Reply goes straight back to the customer, not to our own inbox. */
  return send({ to, subject, text, html, link: "", replyTo: enquiry.email || "" });
}

/* Confirmation to the customer that their project enquiry reached the business.
   Sent to the address they typed on the form, so they know it arrived even when
   they close the page. Replies go back to the business inbox via MAIL_REPLY_TO. */
export function sendProjectEnquiryAcknowledgementEmail(enquiry, to) {
  const escapeAck = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const reference = `SBD-${String(enquiry.id).slice(0, 8).toUpperCase()}`;
  const greeting = enquiry.full_name ? `Hello ${enquiry.full_name},` : "Hello,";
  const price = `USD ${Number(enquiry.starting_price_amount || 0).toLocaleString("en-US")}`;
  const subject = `We received your enquiry — ${reference}`;

  const text = [
    greeting,
    "",
    "Thank you for contacting SBD Solutions. Your project enquiry has been received and the team will reply to you at this email address with a quotation.",
    "",
    `Reference: ${reference}`,
    `Service: ${enquiry.serviceName || enquiry.service}`,
    `Starting price shown: ${price}`,
    "",
    "This is not a final quotation and no payment has been taken. SBD reviews your requirements first, then sends a written quote before any payment is requested.",
    "",
    enquiry.description ? `Your project description:\n${enquiry.description}` : "",
    "",
    "If you need to add anything, simply reply to this email.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#0b1220">
      <h2 style="color:#0b1f3f;margin-bottom:4px">Enquiry received</h2>
      <p style="color:#5b6675;margin-top:0">${escapeAck(reference)}</p>
      <p>${escapeAck(greeting)}</p>
      <p>Thank you for contacting <strong>SBD Solutions</strong>. Your project enquiry has been received and the team will reply to you at this email address with a quotation.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        <tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Reference</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;font-weight:600">${escapeAck(reference)}</td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Service</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5">${escapeAck(enquiry.serviceName || enquiry.service)}</td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Starting price shown</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5">${escapeAck(price)}</td></tr>
      </table>
      <p style="font-size:13px;color:#5b6675;border-top:1px solid #e6ecf5;padding-top:12px">
        This is not a final quotation and no payment has been taken. SBD reviews your requirements first, then sends a written quote before any payment is requested.
      </p>
      <p style="font-size:13px;color:#5b6675">If you need to add anything, simply reply to this email.</p>
    </div>`;

  return send({ to, subject, text, html, link: "" });
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const leadReference = (lead) => `CHAT-${String(lead.id || "").slice(0, 8).toUpperCase()}`;

/* Notification to the assistant owner when the website chat collects a
   visitor's name, email or phone number. The lead is already stored first. */
export function sendChatLeadEmail({ lead, assistantName, businessName, transcript }, to) {
  const reference = leadReference(lead);
  const who = lead.name || lead.email || lead.phone || "Website visitor";
  const subject = `New chat enquiry — ${who} (${reference})`;
  const lines = [
    ["Reference", reference],
    ["Assistant", assistantName || "—"],
    ["Business", businessName || "—"],
    ["Name", lead.name || "—"],
    ["Email", lead.email || "—"],
    ["Phone / WhatsApp", lead.phone || "—"],
    ["Needs", lead.service || "—"],
    ["Captured", new Date(lead.created_at || Date.now()).toLocaleString("en-GB")],
  ];

  const text = [
    "A website visitor shared their contact details in the AI chat.",
    "",
    ...lines.map(([label, value]) => `${label}: ${value}`),
    "",
    "Conversation:",
    transcript || "(no messages yet)",
    "",
    lead.email
      ? `A confirmation email was sent to the visitor at ${lead.email}.`
      : "The visitor did not leave an email address, so no confirmation could be sent.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#0b1220">
      <h2 style="color:#0b1f3f;margin-bottom:4px">New chat enquiry</h2>
      <p style="color:#5b6675;margin-top:0">${escapeHtml(reference)} · ${escapeHtml(assistantName || "AI assistant")}</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${lines
          .map(
            ([label, value]) =>
              `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675;width:38%">${escapeHtml(label)}</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;font-weight:600">${escapeHtml(value)}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="color:#0b1f3f">Conversation</h3>
      <p style="white-space:pre-wrap;line-height:1.6;background:#f5f8ff;border-radius:8px;padding:12px">${escapeHtml(transcript || "(no messages yet)")}</p>
      <p style="font-size:13px;color:#5b6675;border-top:1px solid #e6ecf5;padding-top:12px">
        Reply to this email to reach the visitor directly. The lead is also saved in your dashboard under Leads.
      </p>
    </div>`;

  return send({ to, subject, text, html, link: "", replyTo: lead.email || undefined });
}

/* First message of a new website conversation. Sent even when the visitor has
   not shared contact details yet, so nothing only ever lands in the dashboard. */
export function sendChatStartedEmail({ assistantName, businessName, visitor, transcript, reference }, to) {
  const brand = businessName || assistantName || "your website chat";
  const subject = `New website chat — ${visitor?.name || visitor?.email || "new visitor"} (${reference})`;
  const lines = [
    ["Reference", reference],
    ["Assistant", assistantName || "—"],
    ["Business", businessName || "—"],
    ["Visitor name", visitor?.name || "Not given yet"],
    ["Email", visitor?.email || "Not given yet"],
    ["Phone / WhatsApp", visitor?.phone || "Not given yet"],
    ["Started", new Date().toLocaleString("en-GB")],
  ];

  const text = [
    `A visitor started a conversation with ${brand}.`,
    "",
    ...lines.map(([label, value]) => `${label}: ${value}`),
    "",
    "Conversation so far:",
    transcript || "(no messages yet)",
    "",
    "Reply to this email to reach the visitor when they have shared an address. The conversation is also in your dashboard.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#0b1220">
      <h2 style="color:#0b1f3f;margin-bottom:4px">New website chat</h2>
      <p style="color:#5b6675;margin-top:0">${escapeHtml(reference)} · ${escapeHtml(assistantName || "AI assistant")}</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${lines
          .map(
            ([label, value]) =>
              `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675;width:38%">${escapeHtml(label)}</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;font-weight:600">${escapeHtml(value)}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="color:#0b1f3f">Conversation</h3>
      <p style="white-space:pre-wrap;line-height:1.6;background:#f5f8ff;border-radius:8px;padding:12px">${escapeHtml(transcript || "(no messages yet)")}</p>
      <p style="font-size:13px;color:#5b6675;border-top:1px solid #e6ecf5;padding-top:12px">
        The visitor may share their email or phone in a later message; you will get a second email when they do.
      </p>
    </div>`;

  return send({ to, subject, text, html, link: "", replyTo: visitor?.email || undefined });
}

/* Automatic confirmation to the visitor that their message reached the business. */
export function sendChatLeadAcknowledgementEmail({ lead, assistantName, businessName, transcript }, to) {
  const reference = leadReference(lead);
  const brand = businessName || assistantName || "our team";
  const subject = `We received your message — ${brand}`;
  const greeting = lead.name ? `Hello ${lead.name},` : "Hello,";

  const text = [
    greeting,
    "",
    `Thank you for contacting ${brand}. Your message has been sent to the team and they will reply to you at this email address.`,
    "",
    "Your details:",
    `Email: ${lead.email}`,
    ...(lead.phone ? [`Phone / WhatsApp: ${lead.phone}`] : []),
    ...(lead.service ? [`What you need: ${lead.service}`] : []),
    `Reference: ${reference}`,
    "",
    transcript ? `Your conversation:\n${transcript}` : "",
    "",
    assistantName ? `This confirmation is from the ${assistantName} assistant on behalf of ${brand}.` : "",
    "If you need to add anything, simply reply to this email.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#0b1220">
      <h2 style="color:#0b1f3f">Message received</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>Thank you for contacting <strong>${escapeHtml(brand)}</strong>. Your message has been sent to the team and they will reply to you at this email address.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        <tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Reference</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;font-weight:600">${escapeHtml(reference)}</td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Email</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5">${escapeHtml(lead.email)}</td></tr>
        ${lead.phone ? `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">Phone / WhatsApp</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5">${escapeHtml(lead.phone)}</td></tr>` : ""}
        ${lead.service ? `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5;color:#5b6675">What you need</td><td style="padding:7px 10px;border-bottom:1px solid #e6ecf5">${escapeHtml(lead.service)}</td></tr>` : ""}
      </table>
      ${transcript ? `<h3 style="color:#0b1f3f">Your conversation</h3><p style="white-space:pre-wrap;line-height:1.6;background:#f5f8ff;border-radius:8px;padding:12px">${escapeHtml(transcript)}</p>` : ""}
      <p style="font-size:13px;color:#5b6675">If you need to add anything, simply reply to this email.</p>
    </div>`;

  return send({ to, subject, text, html, link: "" });
}

export function sendVerificationEmail(user, link) {
  const subject = "Verify your SBD Solutions account";
  const text = [
    `Hello ${user.full_name},`,
    "",
    "Confirm your email address to finish setting up your SBD Solutions account.",
    "",
    link,
    "",
    "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#0b1220">
      <h2 style="color:#0b1f3f">Verify your email</h2>
      <p>Hello ${user.full_name},</p>
      <p>Confirm your email address to finish setting up your SBD Solutions account.</p>
      <p><a href="${link}" style="display:inline-block;background:#1f5bea;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
      <p style="font-size:13px;color:#5b6675">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
    </div>`;
  return send({ to: user.email, subject, text, html, link });
}

export function sendPasswordResetEmail(user, link) {
  const subject = "Reset your SBD Solutions password";
  const text = [
    `Hello ${user.full_name},`,
    "",
    "Use the link below to choose a new password. It expires in one hour.",
    "",
    link,
    "",
    "If you did not ask for this, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#0b1220">
      <h2 style="color:#0b1f3f">Reset your password</h2>
      <p>Hello ${user.full_name},</p>
      <p>Use the button below to choose a new password. The link expires in one hour.</p>
      <p><a href="${link}" style="display:inline-block;background:#1f5bea;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Choose a new password</a></p>
      <p style="font-size:13px;color:#5b6675">If you did not ask for this, you can ignore this email.</p>
    </div>`;
  return send({ to: user.email, subject, text, html, link });
}

/* Generic owner notification (support request, unread conversation, usage
   warning). The body is plain text written by the platform, never raw visitor
   input, so it is escaped before it becomes HTML. */
export async function sendNotificationEmail({ title, text, link, businessName }, to) {
  const brand = businessName ? `${businessName} · SBD Solutions` : "SBD Solutions";
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const textBody = [
    ...lines,
    "",
    link ? `Open it in your dashboard: ${link}` : "",
    "You are receiving this because email notifications are on for your SBD Solutions account. You can change this in Dashboard → Notifications.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;color:#0b1220">
      <p style="color:#5b6675;margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(brand)}</p>
      <h2 style="color:#0b1f3f;margin:0 0 12px">${escapeHtml(title)}</h2>
      ${lines.map((line) => `<p style="line-height:1.6;margin:0 0 8px">${escapeHtml(line)}</p>`).join("")}
      ${
        link
          ? `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#0b5cff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open in dashboard</a></p>`
          : ""
      }
      <p style="font-size:12px;color:#5b6675;border-top:1px solid #e6ecf5;padding-top:12px">
        Email notifications are on for your account. Change them in Dashboard → Notifications.
      </p>
    </div>`;

  return send({ to, subject: title, text: textBody, html, link: link || "" });
}
