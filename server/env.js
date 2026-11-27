import "dotenv/config";

const bool = (value) => String(value).toLowerCase() === "true";

/* Public origin used in emailed links. A localhost value is useless in
   production: it would send customers a link their browser cannot open. On
   Render the service URL is always available as RENDER_EXTERNAL_URL, so use it
   whenever APP_URL is missing or still points at a developer machine. */
const trimUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
const configuredAppUrl = trimUrl(process.env.APP_URL);
const renderExternalUrl = trimUrl(process.env.RENDER_EXTERNAL_URL);
const publicAppUrl =
  [configuredAppUrl, renderExternalUrl].find((url) => url && !LOCAL_ORIGIN.test(url)) || "";
const appUrl = publicAppUrl || configuredAppUrl || "http://localhost:3001";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 3002),
  appUrl,
  appUrlIsLocal: LOCAL_ORIGIN.test(appUrl),
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
  payments: {
    /* Paystack gives instant, server-verified card/bank payments. Optional: the
       bank-transfer route below works without it. */
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY || "",
      apiUrl: (process.env.PAYSTACK_API_URL || "https://api.paystack.co").replace(/\/$/, ""),
      /* Empty means: use the plan's own currency. */
      currency: process.env.PAYSTACK_CURRENCY || "",
    },
    /* Flutterwave is the preferred online provider when its key is present;
       otherwise Paystack is used. The key is only ever read on the server. */
    flutterwave: {
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY || "",
      apiUrl: (process.env.FLUTTERWAVE_API_URL || "https://api.flutterwave.com/v3").replace(/\/$/, ""),
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || process.env.FLW_PUBLIC_KEY || "",
    },
    /* Public account details shown on the checkout screen. */
    bank: {
      name: process.env.PAYMENT_BANK_NAME || "",
      accountName: process.env.PAYMENT_ACCOUNT_NAME || "",
      accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "",
      instructions: process.env.PAYMENT_INSTRUCTIONS || "",
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "",
  },
  /* Per-token OpenAI prices for the configured OPENAI_MODEL, in USD per
     1,000,000 tokens. These must match the selected model. If they are
     missing or invalid the AI routes reject requests instead of assuming
     $0 cost. Keep in step with the model configured above. */
  openaiPrices: {
    inputPricePerM:
      Number.parseFloat(process.env.OPENAI_INPUT_PRICE_PER_M || ""),
    outputPricePerM:
      Number.parseFloat(process.env.OPENAI_OUTPUT_PRICE_PER_M || ""),
    cachedInputPricePerM:
      Number.parseFloat(process.env.OPENAI_CACHED_INPUT_PRICE_PER_M || ""),
  },
  /* Live exchange rates for local-currency checkout. The price list is always
     in USD; the rate is fetched (never hardcoded), cached briefly, and the
     exact rate is stored with each payment. */
  fx: {
    url: process.env.FX_API_URL || "https://open.er-api.com/v6/latest/USD",
    baseCurrency: process.env.FX_BASE_CURRENCY || "USD",
    cacheMinutes: Number(process.env.FX_CACHE_MINUTES || 360),
  },
  /* Where project enquiries are emailed. Falls back to the reply-to address. */
  projectEnquiryEmail:
    (process.env.PROJECT_ENQUIRY_EMAIL || process.env.MAIL_REPLY_TO || "sbdiam.solutions@gmail.com").trim(),
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
export const emailConfigured = Boolean(
  env.mail.brevo.apiKey || env.mail.resend.apiKey || env.mail.smtp.host
);
export const aiConfigured = Boolean(env.openai.apiKey);
export const dbConfigured = Boolean(env.databaseUrl);

export const openaiPrices = env.openaiPrices;

export const openaiPricesConfigured = (() => {
  const { inputPricePerM, outputPricePerM, cachedInputPricePerM } = env.openaiPrices;
  if (
    !Number.isFinite(inputPricePerM) ||
    !Number.isFinite(outputPricePerM) ||
    !Number.isFinite(cachedInputPricePerM)
  ) {
    return false;
  }
  if (inputPricePerM < 0 || outputPricePerM < 0 || cachedInputPricePerM < 0) {
    return false;
  }
  return true;
})();

if (env.isProd && env.sessionSecret.startsWith("dev-only")) {
  console.warn("[config] SESSION_SECRET is not set — set it before running in production.");
}

if (env.isProd && env.appUrlIsLocal) {
  console.error(
    `[config] Emailed links would point at ${env.appUrl}. Set APP_URL to the public origin (for example https://sbdaisolutions.onrender.com) so verification and reset links open the live site.`
  );
} else if (env.isProd && configuredAppUrl && LOCAL_ORIGIN.test(configuredAppUrl) && publicAppUrl) {
  console.warn(
    `[config] APP_URL is ${configuredAppUrl} — using ${appUrl} for emailed links instead. Set APP_URL to ${appUrl} to make this explicit.`
  );
}
