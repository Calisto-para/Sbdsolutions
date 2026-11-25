import "dotenv/config";

const bool = (value) => String(value).toLowerCase() === "true";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 3002),
  appUrl: (process.env.APP_URL || "http://localhost:3001").replace(/\/$/, ""),
  databaseUrl: process.env.DATABASE_URL || "",
  pgliteDir: process.env.PGLITE_DIR || ".data/pglite",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-session-secret",
  cookieSecure: bool(process.env.COOKIE_SECURE),
  /* Comma-separated addresses that are promoted to the operator role on boot and sign-in. */
  adminEmails: [
    ...(process.env.ADMIN_EMAILS || "").split(","),
    process.env.ADMIN_EMAIL || "",
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  /* A single operator account created/updated from the environment at boot. */
  adminEmail: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminName: (process.env.ADMIN_NAME || "Administrator").trim(),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "",
  },
  mail: {
    /* brevo | resend | smtp. Empty means: first configured provider wins. */
    provider: (process.env.EMAIL_PROVIDER || "").trim().toLowerCase(),
    from: process.env.MAIL_FROM || "SBD AI Solutions <sbdiam.solutions@gmail.com>",
    replyTo: process.env.MAIL_REPLY_TO || "",
    brevo: {
      /* BREVO is often written as "bravo"; accept both so a typed variable name
         does not silently disable delivery. */
      apiKey: process.env.BREVO_API_KEY || process.env.BRAVO_API_KEY || "",
      apiUrl: process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email",
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY || "",
      apiUrl: process.env.RESEND_API_URL || "https://api.resend.com/emails",
    },
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      secure: bool(process.env.SMTP_SECURE),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  },
};

export const dbConfigured = Boolean(env.databaseUrl);
export const emailConfigured = Boolean(
  env.mail.brevo.apiKey || env.mail.resend.apiKey || env.mail.smtp.host
);
export const aiConfigured = Boolean(env.openai.apiKey);

if (env.isProd && env.sessionSecret.startsWith("dev-only")) {
  console.warn("[config] SESSION_SECRET is not set — set it before running in production.");
}
