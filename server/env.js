import "dotenv/config";
import crypto from "node:crypto";

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

/* Comma-separated addresses that are promoted to the operator role. */
const adminEmails = [...(process.env.ADMIN_EMAILS || "").split(","), process.env.ADMIN_EMAIL || ""]
  .map((value) => value.trim().toLowerCase())
  .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret";
const configuredSessionSecret = process.env.SESSION_SECRET || "";
/* A known default secret would let anyone forge a session, including an
   operator one. In production, fall back to a random per-boot secret instead
   (everyone signs in again after a restart) and say so loudly. */
const sessionSecret =
  configuredSessionSecret || (process.env.NODE_ENV === "production" ? crypto.randomBytes(32).toString("hex") : DEV_SESSION_SECRET);

/* Who receives a public project enquiry: the dedicated inbox, the reply-to
   address and every operator address, so it cannot land only in an unread
   fallback mailbox. */
const projectEnquiryEmails = [
  ...(process.env.PROJECT_ENQUIRY_EMAIL || "").split(","),
  ...(process.env.MAIL_REPLY_TO || "").split(","),
  ...adminEmails,
]
  /* Only real addresses: a display-name form such as `Support <a@b.com>` or a
     stray word would otherwise become an invalid recipient and the provider
     would reject the entire notification. */
  .map((value) => (String(value).match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/) || [""])[0].toLowerCase())
  .filter(Boolean)
  .filter((value, index, list) => list.indexOf(value) === index);

if (!configuredSessionSecret && process.env.NODE_ENV === "production") {
  console.error(
    "[security] SESSION_SECRET is not set. Using a random secret for this process: users are signed out on every restart. Set SESSION_SECRET to a long random value in the service environment."
  );
}

/* Official OpenAI Standard API prices, USD per 1,000,000 tokens, checked
   against https://developers.openai.com/api/docs/pricing on 27 November 2026.
   They are only a fallback: an explicit OPENAI_*_PRICE_PER_M variable wins, so
   a price change on OpenAI's side is a one-line edit here or an env override.
   An unknown model with no env prices resolves to no prices at all, which
   pauses AI rather than billing an invented rate. */
const MODEL_PRICES = {
  "gpt-6-luna": {
    input: 0.1,
    cachedInput: 0.01,
    output: 0.5,
    cacheWrite: 0.125,
    longContext: { threshold: 272000, input: 0.2, cachedInput: 0.02, output: 0.75, cacheWrite: 0.25 },
  },
  "gpt-6.1-terra": { input: 1.0, cachedInput: 0.05, output: 5.0, cacheWrite: 1.25 },
  "gpt-6.1-sol": { input: 2.0, cachedInput: 0.1, output: 10.0, cacheWrite: 2.5 },
  "gpt-6-sol": { input: 2.0, cachedInput: 0.2, output: 10.0, cacheWrite: 2.5 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2, cacheWrite: 0.25 },
  "gpt-5.6-terra": { input: 2.0, cachedInput: 0.2, output: 12.0, cacheWrite: 2.5 },
  "gpt-5.6-sol": { input: 4.0, cachedInput: 0.4, output: 20.0, cacheWrite: 5.0 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

const configuredModel = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const catalogPrices = MODEL_PRICES[configuredModel] || null;
/* Empty/invalid env values fall back to the verified catalog price. */
const priceFrom = (value, fallback) => {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
};
const inputPriceIsEnv = Number.isFinite(Number.parseFloat(process.env.OPENAI_INPUT_PRICE_PER_M || ""));
const pricesUseCatalog =
  Boolean(catalogPrices) &&
  (!inputPriceIsEnv ||
    !Number.isFinite(Number.parseFloat(process.env.OPENAI_OUTPUT_PRICE_PER_M || "")) ||
    !Number.isFinite(Number.parseFloat(process.env.OPENAI_CACHED_INPUT_PRICE_PER_M || "")));

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 3002),
  appUrl,
  appUrlIsLocal: LOCAL_ORIGIN.test(appUrl),
  databaseUrl: process.env.DATABASE_URL || "",
  pgliteDir: process.env.PGLITE_DIR || ".data/pglite",
  sessionSecret,
  cookieSecure: bool(process.env.COOKIE_SECURE),
  adminEmails,
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
    model: configuredModel,
    baseUrl: process.env.OPENAI_BASE_URL || "",
  },
  /* Per-token OpenAI prices for the configured OPENAI_MODEL, in USD per
     1,000,000 tokens. An env override wins; otherwise the verified catalog
     price for that model id is used. If neither exists the AI routes reject
     requests instead of assuming $0 cost. */
  openaiPrices: {
    model: configuredModel,
    inputPricePerM: priceFrom(process.env.OPENAI_INPUT_PRICE_PER_M, catalogPrices?.input),
    outputPricePerM: priceFrom(process.env.OPENAI_OUTPUT_PRICE_PER_M, catalogPrices?.output),
    cachedInputPricePerM: priceFrom(
      process.env.OPENAI_CACHED_INPUT_PRICE_PER_M,
      catalogPrices?.cachedInput
    ),
    cacheWritePricePerM: priceFrom(
      process.env.OPENAI_CACHE_WRITE_PRICE_PER_M,
      catalogPrices?.cacheWrite
    ),
    longContext: catalogPrices?.longContext || null,
    source: pricesUseCatalog ? "catalog" : inputPriceIsEnv ? "env" : "none",
  },
  /* Live exchange rates for local-currency checkout. The price list is always
     in USD; the rate is fetched (never hardcoded), cached briefly, and the
     exact rate is stored with each payment. */
  fx: {
    url: process.env.FX_API_URL || "https://open.er-api.com/v6/latest/USD",
    baseCurrency: process.env.FX_BASE_CURRENCY || "USD",
    cacheMinutes: Number(process.env.FX_CACHE_MINUTES || 360),
  },
  /* Where project enquiries are emailed: an explicit inbox, plus the reply-to
     address and every operator, so the owner always sees them. */
  projectEnquiryEmail:
    projectEnquiryEmails[0] ||
    (process.env.PROJECT_ENQUIRY_EMAIL || process.env.MAIL_REPLY_TO || "sbdiam.solutions@gmail.com").trim(),
  projectEnquiryEmails: projectEnquiryEmails.length
    ? projectEnquiryEmails
    : [(process.env.PROJECT_ENQUIRY_EMAIL || "sbdiam.solutions@gmail.com").trim()],
  mail: {
    /* brevo | resend | smtp. Empty means: first configured provider wins.
       "bravo" is a common spelling of Brevo and is treated as the same
       provider, as is the BRAVO_API_KEY variable below. */
    provider: ((process.env.EMAIL_PROVIDER || "").trim().toLowerCase() === "bravo"
      ? "brevo"
      : (process.env.EMAIL_PROVIDER || "").trim().toLowerCase()),
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
  /* All-zero rates cannot be a real tariff; treat them as unconfigured. */
  return inputPricePerM + outputPricePerM > 0;
})();

if (catalogPrices && inputPriceIsEnv) {
  const mismatch =
    Number.parseFloat(process.env.OPENAI_INPUT_PRICE_PER_M || "") !== catalogPrices.input ||
    Number.parseFloat(process.env.OPENAI_OUTPUT_PRICE_PER_M || "") !== catalogPrices.output;
  if (mismatch) {
    console.warn(
      `[ai] OPENAI_*_PRICE_PER_M do not match the verified prices for ${configuredModel} ` +
        `(input $${catalogPrices.input}, output $${catalogPrices.output}, cached $${catalogPrices.cachedInput} per 1M). ` +
        "Credits are calculated from the env values; remove them to use the verified catalog."
    );
  }
}

if (aiConfigured) {
  console.log(
    `[ai] model=${env.openai.model} prices=${openaiPricesConfigured ? env.openaiPrices.source : "MISSING"} ` +
      `input=${env.openaiPrices.inputPricePerM}/1M cached=${env.openaiPrices.cachedInputPricePerM}/1M ` +
      `output=${env.openaiPrices.outputPricePerM}/1M`
  );
}

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
