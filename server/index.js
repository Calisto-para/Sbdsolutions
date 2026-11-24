import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { env, dbConfigured, emailConfigured, aiConfigured } from "./env.js";
import { migrate } from "./migrate.js";
import { dbKind } from "./db.js";
import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import assistantRoutes from "./routes/assistants.js";
import conversationRoutes from "./routes/conversations.js";
import overviewRoutes from "./routes/overview.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: dbKind() || "not-initialised",
    emailConfigured,
    aiConfigured,
    environment: env.nodeEnv,
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/assistants", assistantRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/overview", overviewRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

/* Static site: the built app in dist/, with clean URLs mapped to the real
   prerendered .html files. */
const DIST = path.resolve("dist");
const ROUTE_FILES = {
  "/": "index.html",
  "/dashboard": "dashboard.html",
  "/register": "register.html",
  "/login": "login.html",
  "/forgot-password": "forgot-password.html",
  "/reset-password": "reset-password.html",
  "/verify-email": "verify-email.html",
  "/services": "services.html",
  "/projects": "projects.html",
  "/about": "about.html",
  "/who-we-help": "who-we-help.html",
  "/contact": "contact.html",
  "/start-a-project": "start-a-project.html",
};

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { extensions: ["html"], maxAge: env.isProd ? "1h" : 0 }));
  app.get(Object.keys(ROUTE_FILES), (req, res) => {
    res.sendFile(path.join(DIST, ROUTE_FILES[req.path]));
  });
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(DIST, "index.html"));
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
    return res.status(413).json({ error: "That file is larger than the 10 MB limit." });
  }

  console.error("[api]", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = env.port;
await migrate();
app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on ${port}`);
  console.log(`[server] database: ${dbConfigured ? "Neon/Postgres (DATABASE_URL)" : `local PGlite (${env.pgliteDir})`}`);
  console.log(`[server] email: ${emailConfigured ? "SMTP configured" : "not configured — links are logged"}`);
  console.log(`[server] AI: ${aiConfigured ? `OpenAI ${env.openai.model}` : "not configured — add OPENAI_API_KEY"}`);
});
