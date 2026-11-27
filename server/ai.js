import OpenAI from "openai";
import { env, aiConfigured, openaiPricesConfigured, openaiPrices } from "./env.js";
import crypto from "node:crypto";
import { one } from "./db.js";
import {
  chargeAiUsage,
  costInDollars,
  creditsFor,
  normalizedUsage,
} from "./plans.js";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI assistant is not connected yet. Add OPENAI_API_KEY to enable chat.");
    this.status = 503;
    this.code = "AI_NOT_CONFIGURED";
  }
}

/* Without verified prices there is no honest way to bill a request. Refusing
   before OpenAI is called keeps the business from serving free AI and keeps
   the customer from being charged an invented amount. */
export class AiPricingError extends Error {
  constructor() {
    super(
      "AI billing is not configured on the server, so chat is paused. An operator must set the OpenAI model prices."
    );
    this.status = 503;
    this.code = "AI_PRICING_NOT_CONFIGURED";
  }
}

/* An upstream model failure is not the visitor's fault and must never look like
   a broken website. The real reason is logged on the server; the visitor gets a
   clear, retryable message. */
export class AiUnavailableError extends Error {
  constructor() {
    super("The assistant could not answer just now. Please try again in a moment.");
    this.status = 502;
    this.code = "AI_UNAVAILABLE";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The last upstream failure, in memory only. Exposed on /api/health so an
   operator can see why the assistant stopped answering (bad key, exhausted
   quota, wrong model) without digging through Render logs. Never contains the
   API key or any customer data. */
export const aiStatus = { lastFailure: null };

function noteFailure(error, attempt) {
  aiStatus.lastFailure = {
    at: new Date().toISOString(),
    attempt,
    status: Number(error?.status || 0),
    code: String(error?.code || error?.error?.code || "").slice(0, 80),
    message: String(error?.message || error || "Unknown AI error").slice(0, 200),
  };
}

let client = null;

function getClient() {
  if (!aiConfigured) throw new AiNotConfiguredError();
  if (!client) {
    client = new OpenAI({
      apiKey: env.openai.apiKey,
      baseURL: env.openai.baseUrl || undefined,
    });
  }
  return client;
}

const TONE = {
  friendly: "Warm, helpful and conversational.",
  professional: "Professional, clear and businesslike.",
  concise: "Very concise — short answers, no filler.",
  formal: "Formal and polite, as in a corporate support desk.",
};

function knowledgeBlock(items) {
  if (!items.length) return "No business information has been added yet.";
  const parts = items.map((item) => {
    const label = item.kind === "faq" ? "FAQ" : item.kind === "pricing" ? "Pricing" : item.kind === "document" ? "Document" : "Business information";
    const title = item.title ? `${item.title}: ` : "";
    /* Long training documents are shortened per item so one PDF cannot crowd
       every other source out of the assistant's context. */
    return `- [${label}] ${title}${String(item.content || "").slice(0, 6000)}`;
  });
  return parts.join("\n").slice(0, 24000);
}

const LEAD_GUIDANCE = [
  "You are speaking to a visitor on the business website.",
  "Early in the conversation ask for their name, their email address, their phone number and what service or product they need.",
  "Ask for those details one or two at a time, conversationally, never as a form or a list of questions.",
  "Once you have them, confirm the details back and say the team will follow up.",
  "When the visitor's question is handled and they have nothing else to ask, briefly suggest they can end the chat with the End chat button at the top of the window, and that they can start a new chat at any time.",
];

export function buildSystemPrompt({ assistant, business, knowledge, businessContext = "", channel = "dashboard" }) {
  return [
    ...(channel === "widget" ? LEAD_GUIDANCE : []),
    `You are ${assistant.name}, the AI assistant for ${business?.name || "this business"}.`,
    assistant.business_description ? `About the business: ${assistant.business_description}` : "",
    assistant.services ? `Services offered: ${assistant.services}` : "",
    assistant.products ? `Products offered: ${assistant.products}` : "",
    business?.website ? `Website: ${business.website}` : "",
    business?.support_email ? `Support email: ${business.support_email}` : "",
    business?.phone ? `Phone: ${business.phone}` : "",
    `Communication style: ${TONE[assistant.tone] || TONE.friendly}`,
    `Reply in ${assistant.language || "English"}.`,
    "Use only the business information below when answering questions about the business.",
    "If the answer is not covered, say you do not have that detail and offer to pass the enquiry to the team.",
    "Never invent prices, policies or availability. Keep replies short and practical.",
    assistant.instructions ? `Additional instructions from the business owner: ${assistant.instructions}` : "",
    "",
    "Business information supplied by the owner:",
    businessContext || "No business profile has been filled in yet.",
    "",
    "Training material, FAQs and document passages supplied by the owner:",
    knowledgeBlock(knowledge),
  ]
    .filter(Boolean)
    .join("\n");
}

/* Ask the model once. Some models reject max_completion_tokens in favour of
   max_tokens, and a transient 429/5xx is worth one automatic retry: those two
   cases used to surface as "Your message was not delivered" on the widget. */
export async function complete({ system, messages }) {
  if (!openaiPricesConfigured) throw new AiPricingError();
  const openai = getClient();
  const base = {
    model: env.openai.model,
    messages: [{ role: "system", content: system }, ...messages],
  };
  const payloads = [
    { ...base, max_completion_tokens: 400 },
    { ...base, max_tokens: 400 },
  ];

  let payloadIndex = 0;
  let attempts = 0;

  while (attempts < 3) {
    attempts += 1;
    try {
      const response = await openai.chat.completions.create(payloads[payloadIndex]);
      const text = response.choices?.[0]?.message?.content?.trim();
      if (text) {
        aiStatus.lastFailure = null;
        return { text, usage: response.usage ?? null };
      }
      const empty = new Error("The AI returned an empty response.");
      console.error(`[ai] empty response (attempt ${attempts})`);
      noteFailure(empty, attempts);
      if (attempts < 2) {
        await sleep(400);
        continue;
      }
      break;
    } catch (error) {
      const status = Number(error?.status || 0);
      const message = String(error?.message || "");
      console.error(
        `[ai] request failed (attempt ${attempts}, status ${status || "?"}, code ${error?.code || error?.error?.code || "?"}): ${message}`
      );
      noteFailure(error, attempts);

      /* Some models reject max_completion_tokens. Switch parameter once; that
         is a compatibility fix, not a retry. */
      const rejectedParameter =
        status === 400 && /max_completion_tokens|max_tokens|unsupported|unknown parameter/i.test(message);
      if (rejectedParameter && payloadIndex === 0) {
        payloadIndex = 1;
        continue;
      }

      /* A rate limit with a short Retry-After is worth one quick retry; an
         exhausted daily quota is not, and should not make the visitor wait.
         Everything else that looks transient (5xx, network, timeout) gets one
         more try. */
      const retryAfter = Number(error?.headers?.["retry-after"] || 0);
      const brieflyThrottled = status === 429 && retryAfter > 0 && retryAfter <= 3;
      const retryable =
        status === 0 ||
        status >= 500 ||
        brieflyThrottled ||
        /empty response|timeout|ECONNRESET|socket hang up/i.test(message);
      if (retryable && attempts < 2) {
        await sleep(500);
        continue;
      }
      break;
    }
  }

  throw new AiUnavailableError();
}

/* Record the real OpenAI cost of one completed request against a customer
   account. The cost comes from the token usage OpenAI returned, at the
   verified prices of the model that actually answered; it is never derived
   from a message count or an average. Dollars and SBD AI credits are added
   atomically, and the same operation (same idempotency key) is only ever
   billed once.

   Returns what happened so callers and tests can assert on it:
   { charged, reason, dollars, credits }. */
export async function recordAiCost(userId, usage, options = {}) {
  /* A failed or empty request has no usage, so it has nothing to charge. */
  if (!usage) return { charged: false, reason: "no-usage" };
  if (!openaiPricesConfigured) {
    console.error(
      "[ai] usage received but no verified model prices are configured — this request was not billed."
    );
    return { charged: false, reason: "prices-not-configured" };
  }

  const dollars = costInDollars(usage, openaiPrices);
  const credits = creditsFor(dollars);
  if (!Number.isFinite(dollars) || dollars <= 0 || !Number.isFinite(credits) || credits <= 0) {
    return { charged: false, reason: "no-cost" };
  }

  const tokens = normalizedUsage(usage);
  const idempotencyKey = String(options.key || "").trim() || `req-${crypto.randomUUID()}`;

  /* The ledger row is the idempotency lock: a retried operation loses the
     insert on the unique key and therefore never charges twice. */
  const ledger = await one(
    `insert into ai_usage_events
       (user_id, idempotency_key, model, source, prompt_tokens, cached_tokens,
        cache_write_tokens, completion_tokens, reasoning_tokens, cost_usd, credits)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (user_id, idempotency_key) do nothing
     returning id`,
    [
      userId,
      idempotencyKey,
      env.openai.model,
      String(options.source || "").slice(0, 40),
      tokens.promptTokens,
      tokens.cachedTokens,
      tokens.cacheWriteTokens,
      tokens.completionTokens,
      tokens.reasoningTokens,
      dollars,
      credits,
    ]
  );
  if (!ledger) return { charged: false, reason: "duplicate" };

  const totals = await chargeAiUsage(userId, dollars);
  const reachedCredits =
    totals?.credit_limit != null && Number(totals.credits_used) >= Number(totals.credit_limit);
  const reachedSpending =
    totals?.underlying_cost != null && Number(totals.spending_used) >= Number(totals.underlying_cost);
  if (reachedCredits || reachedSpending) {
    /* No suspension here: the account keeps dashboard access so it can renew
       or upgrade, while the pre-flight gate stops further AI calls. */
    console.log(
      `[ai] account ${userId} reached its ${reachedCredits ? "SBD credit" : "internal API spending"} limit.`
    );
  }

  return { charged: true, dollars, credits, totals };
}
