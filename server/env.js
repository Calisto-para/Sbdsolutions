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
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "SBD AI Solutions <sbdiam.solutions@gmail.com>",
  },
};

export const dbConfigured = Boolean(env.databaseUrl);
export const emailConfigured = Boolean(env.smtp.host);
export const aiConfigured = Boolean(env.openai.apiKey);

if (env.isProd && env.sessionSecret.startsWith("dev-only")) {
  console.warn("[config] SESSION_SECRET is not set — set it before running in production.");
}
