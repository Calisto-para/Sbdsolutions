import nodemailer from "nodemailer";
import { env, emailConfigured } from "./env.js";

let transporter = null;

function getTransporter() {
  if (!emailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function send({ to, subject, text, html, link }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[mail] SMTP not configured. ${subject} -> ${to}`);
    console.log(`[mail] link: ${link}`);
    return { delivered: false, previewUrl: link };
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, text, html });
  return { delivered: true };
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
