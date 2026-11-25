import nodemailer from "nodemailer";
import { env } from "./env.js";

const REQUEST_TIMEOUT_MS = 15000;

/* MAIL_FROM looks like `SBD AI Solutions <hello@example.com>`. Brevo needs the
   name and address separately; Resend and SMTP take the whole string back. */
function parseFrom(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) {
    return { name: "SBD AI Solutions", email: raw, formatted: raw };
  }
  const name = match[1].replace(/^"|"$/g, "").trim() || "SBD AI Solutions";
  const email = match[2].trim();
  return { name, email, formatted: `${name} <${email}>` };
}

const from = parseFrom(env.mail.from);

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
async function sendWithBrevo({ to, subject, text, html }) {
  return postJson(
    env.mail.brevo.apiUrl,
    { "api-key": env.mail.brevo.apiKey },
    {
      sender: { name: from.name, email: from.email },
      to: [{ email: to }],
      ...(env.mail.replyTo ? { replyTo: { email: env.mail.replyTo } } : {}),
      subject,
      htmlContent: html,
      textContent: text,
    }
  );
}

/* Resend — POST /emails. Authenticates with a bearer token. */
async function sendWithResend({ to, subject, text, html }) {
  return postJson(
    env.mail.resend.apiUrl,
    { authorization: `Bearer ${env.mail.resend.apiKey}` },
    {
      from: from.formatted,
      to: [to],
      ...(env.mail.replyTo ? { reply_to: env.mail.replyTo } : {}),
      subject,
      html,
      text,
    }
  );
}

async function sendWithSmtp({ to, subject, text, html }) {
  await smtp().sendMail({ from: from.formatted, to, subject, text, html });
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

async function send({ to, subject, text, html, link }) {
  const order = emailProviders();
  if (!order.length) {
    console.log(`[mail] No email provider configured. ${subject} -> ${to}`);
    console.log(`[mail] link: ${link}`);
    return { delivered: false, previewUrl: link };
  }

  const failures = [];
  for (const name of order) {
    try {
      await SENDERS[name]({ to, subject, text, html });
      console.log(`[mail] "${subject}" delivered to ${to} via ${name}`);
      return { delivered: true, provider: name };
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.error(`[mail] ${name} failed for ${to} — ${error.message}`);
    }
  }

  console.error(`[mail] every provider failed for ${to} — ${failures.join(" | ")}`);
  return { delivered: false, previewUrl: link, failures };
}

/* Used by the operator dashboard to prove the sending account works. */
export async function sendTestEmail(to) {
  const subject = "SBD AI Solutions test email";
  const text = "This is a test message from the SBD AI Solutions platform. If you can read it, verification and password-reset email will reach customers too.";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0b1220"><h2 style="color:#0b1f3f">Test email</h2><p>${text}</p></div>`;
  return send({ to, subject, text, html, link: "" });
}

export function sendVerificationEmail(user, link) {
  const subject = "Verify your SBD AI Solutions account";
  const text = [
    `Hello ${user.full_name},`,
    "",
    "Confirm your email address to finish setting up your SBD AI Solutions account.",
    "",
    link,
    "",
    "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#0b1220">
      <h2 style="color:#0b1f3f">Verify your email</h2>
      <p>Hello ${user.full_name},</p>
      <p>Confirm your email address to finish setting up your SBD AI Solutions account.</p>
      <p><a href="${link}" style="display:inline-block;background:#1f5bea;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
      <p style="font-size:13px;color:#5b6675">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
    </div>`;
  return send({ to: user.email, subject, text, html, link });
}

export function sendPasswordResetEmail(user, link) {
  const subject = "Reset your SBD AI Solutions password";
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
