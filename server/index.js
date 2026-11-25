import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { env, dbConfigured, emailConfigured, aiConfigured } from "./env.js";
import { emailProviderName, emailProviders } from "./mail.js";
import { senderWarning, emailHealthSnapshot } from "./mail-check.js";
import { dbKind, dbState, getImplementation } from "./db.js";
import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import assistantRoutes from "./routes/assistants.js";
import conversationRoutes from "./routes/conversations.js";
import overviewRoutes from "./routes/overview.js";
import adminRoutes from "./routes/admin.js";
import widgetRoutes from "./routes/widget.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import leadRoutes from "./routes/leads.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* Authenticated JSON must never be served from a browser or proxy cache; a
   cached empty list made uploaded training look like it had vanished. */
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

app.get("/api/health", (req, res) => {
  /* Kicks off a background, read-only sender check; never blocks this probe. */
  const mail = emailHealthSnapshot();
  res.json({
    ...(mail ? { emailHealth: mail } : {}),
    ok: true,
    database: dbKind() || "not-initialised",
    dbReady: dbState.ready,
    dbError: dbState.error || null,
    emailConfigured,
    emailProvider: emailProviderName,
    emailProviders: emailProviders(),
    emailProviderRequested: env.mail.provider || "",
    /* Which sender variables this service can actually see. Presence only — no values. */
    emailEnv: {
      BREVO_API_KEY: Boolean(process.env.BREVO_API_KEY),
      BRAVO_API_KEY: Boolean(process.env.BRAVO_API_KEY),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
      SMTP_HOST: Boolean(process.env.SMTP_HOST),
      MAIL_FROM: process.env.MAIL_FROM ? "set" : "default",
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || "auto",
    },
    aiConfigured,
    /* Which ways customers can pay. Booleans only — no keys or account numbers. */
    paymentMethods: {
      online: Boolean(process.env.PAYSTACK_SECRET_KEY),
      bank: Boolean(process.env.PAYMENT_ACCOUNT_NUMBER && process.env.PAYMENT_ACCOUNT_NAME),
    },
    /* Origin that verification and reset links use — safe to show, it is public. */
    publicUrl: env.appUrl,
    environment: env.nodeEnv,
  });
});

/* Keep answering while the database is still starting, with a clear message
   rather than a crash or an empty 500. */
app.use("/api", (req, res, next) => {
  if (dbState.ready) return next();
  res.status(503).json({
    error: "The platform database is still starting up. Please try again in a few seconds.",
    code: "DB_NOT_READY",
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/assistants", assistantRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/widget", widgetRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/leads", leadRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

/* The embeddable chat widget any customer can paste into their own website. */
const WIDGET_SCRIPT = path.resolve("server/widget-embed.js");
app.get("/widget.js", (req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", env.isProd ? "public, max-age=300" : "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  res.sendFile(WIDGET_SCRIPT);
});

/* Static site: the built app in dist/, with clean URLs mapped to the real
   prerendered .html files. */
const DIST = path.resolve("dist");
const APP_SHELL = "index.html";

const hasBuild = fs.existsSync(path.join(DIST, "index.html"));
const WEB_ROOT = hasBuild ? DIST : path.resolve(".");

if (!hasBuild) {
  console.warn("[web] dist/ is missing — the build step did not run. Serving the prerendered pages committed at the repo root.");
}

/* The operator area is unlisted: keep it out of search engines. */
app.use("/admin", (req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

if (fs.existsSync(WEB_ROOT)) {
  app.use(express.static(WEB_ROOT, { extensions: ["html"], maxAge: env.isProd ? "1h" : 0 }));
  /* Client-side routing: every non-file path boots the React app. */
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(WEB_ROOT, APP_SHELL));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    const fieldErrors = {};
    for (const issue of error.issues) fieldErrors[issue.path.join(".") || "form"] = issue.message;
    return res.status(400).json({ error: error.issues[0]?.message || "Please check the form.", fieldErrors });
  }

  if (error?.code === "AI_NOT_CONFIGURED") {
    return res.status(503).json({ error: error.message, code: "AI_NOT_CONFIGURED" });
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "That file is larger than the 10 MB limit. Compress the PDF or split it into smaller documents.",
      code: "FILE_TOO_LARGE",
    });
  }

  /* Multer rejects a wrong field name or an unexpected file before the route
     body runs; answer with something the upload form can display. */
  if (String(error?.code || "").startsWith("LIMIT_") || error?.name === "MulterError") {
    return res.status(400).json({
      error: "That upload could not be read. Choose a PDF file and try again.",
      code: "UPLOAD_REJECTED",
    });
  }

  console.error("[api]", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = env.port;

/* Bind first: Render needs an open port quickly, and a slow database wake-up
   must not look like a failed deploy. */
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on ${port}`);
  console.log(`[server] database: ${dbConfigured ? "Postgres via DATABASE_URL" : `local PGlite (${env.pgliteDir}) — data is not durable`}`);
  console.log(
    `[server] email: ${
      emailConfigured
        ? `${emailProviders().join(" → ")} configured, ${emailProviderName} first`
        : "not configured — verification links are logged and shown on screen"
    }`
  );
  const mailWarning = emailProviderName === "resend" ? senderWarning() : "";
  if (mailWarning) console.error(`[mail] ${mailWarning}`);
  if (env.mail.provider && emailProviderName !== env.mail.provider) {
    console.error(
      `[mail] EMAIL_PROVIDER=${env.mail.provider} is not usable (missing API key or SMTP host) — sending via ${emailProviderName || "nothing"} instead.`
    );
  }
  console.log(`[server] AI: ${aiConfigured ? `OpenAI ${env.openai.model}` : "not configured — add OPENAI_API_KEY"}`);
  console.log(
    `[server] operator login: ${
      env.adminEmail
        ? `${env.adminEmail}${env.adminPassword ? " (password from ADMIN_PASSWORD)" : " — ADMIN_PASSWORD is missing"}`
        : "no ADMIN_EMAIL set"
    }`
  );
  if (env.isProd && !dbConfigured) {
    console.error("[db] DATABASE_URL is not set in production — data will be lost on every deploy.");
  }
  connectDatabase();
});

server.on("error", (error) => {
  console.error("[server] failed to start:", error.message);
  process.exit(1);
});

async function query(text, params = []) {
  const db = await getImplementation();
  return db.query(text, params);
}

async function runMigration() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const sqlPath = path.resolve(here, "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await query(statement);
  }

  const { env: _env } = await import("./env.js");
  for (const address of _env.adminEmails) {
    await query(
      `update users
          set role = 'admin',
              email_verified_at = coalesce(email_verified_at, now()),
              updated_at = now()
        where lower(email) = $1 and (role <> 'admin' or email_verified_at is null)`,
      [address]
    );
  }

  const { ensureEnvAdmin } = await import("./admin-account.js");
  await ensureEnvAdmin();

  console.log(`[db] schema ready (${statements.length} statements)`);
}

async function connectDatabase(attempt = 1) {
  try {
    await runMigration();
    dbState.ready = true;
    dbState.error = null;
  } catch (error) {
    dbState.ready = false;
    dbState.error = error.message;
    console.error(`[db] connect/migrate attempt ${attempt} failed: ${error.message}`);
    if (attempt < 24) {
      setTimeout(() => connectDatabase(attempt + 1), 5000);
    } else {
      console.error("[db] giving up after 24 attempts (120s) — check DATABASE_URL and that the Neon database accepts connections.");
    }
  }
}
