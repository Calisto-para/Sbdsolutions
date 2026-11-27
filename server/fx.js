import { env } from "./env.js";
import {
  BASE_CURRENCY,
  PAYMENT_CURRENCIES,
  isPaymentCurrency,
  roundMoney,
} from "../shared/currencies.js";

/* Live USD exchange rates used at checkout. Rates are fetched from a public
   FX endpoint (no key required), cached for a short window, and never
   hardcoded. The rate used for a payment is stored with that payment, so a
   later rate change can never rewrite what the customer paid.

   If the rate service is unavailable the checkout stops and offers USD instead
   of guessing: silently charging a different amount is not acceptable. */

export class FxUnavailableError extends Error {
  constructor(message) {
    super(message || "We could not get a current exchange rate just now. Please try again, or pay in USD.");
    this.status = 503;
    this.code = "FX_UNAVAILABLE";
  }
}

const MAX_STALE_MS = 12 * 60 * 60 * 1000;

let cache = { at: 0, rates: null, source: "", stale: false };

export function fxConfig() {
  return {
    provider: "open.er-api.com",
    base: BASE_CURRENCY,
    supported: Object.keys(PAYMENT_CURRENCIES),
    cacheMinutes: env.fx.cacheMinutes,
  };
}

async function fetchRates() {
  const response = await fetch(env.fx.url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`FX endpoint responded with HTTP ${response.status}`);
  const data = await response.json().catch(() => ({}));
  const rates = data.rates || data.conversion_rates || null;
  if (!rates || typeof rates !== "object") throw new Error("FX endpoint returned no rates");
  return { rates, source: env.fx.url };
}

function normaliseRates(data) {
  /* open.er-api.com returns numbers; some providers return {rate: number}. */
  const out = {};
  for (const [code, value] of Object.entries(data)) {
    const rate = Number(typeof value === "object" && value !== null ? value.rate ?? value.value : value);
    if (Number.isFinite(rate) && rate > 0) out[code.toUpperCase()] = rate;
  }
  return out;
}

async function rates() {
  const ttl = Math.max(1, env.fx.cacheMinutes) * 60 * 1000;
  const fresh = cache.rates && Date.now() - cache.at < ttl;
  if (fresh) return cache;

  try {
    const { rates: raw, source } = await fetchRates();
    cache = { at: Date.now(), rates: normaliseRates(raw), source, stale: false };
    return cache;
  } catch (error) {
    console.error(`[fx] rate fetch failed: ${error.message}`);
    if (cache.rates && Date.now() - cache.at < MAX_STALE_MS) {
      cache.stale = true;
      return cache;
    }
    throw new FxUnavailableError();
  }
}

/* Convert a USD amount into a supported payment currency. */
export async function quoteInCurrency(amountUsd, currency) {
  const code = String(currency || BASE_CURRENCY).toUpperCase();
  if (!isPaymentCurrency(code)) {
    const error = new Error(
      `Payments are not available in ${code}. You can pay in ${Object.keys(PAYMENT_CURRENCIES).join(", ")}.`
    );
    error.status = 400;
    error.code = "CURRENCY_UNSUPPORTED";
    throw error;
  }
  if (code === BASE_CURRENCY) {
    return {
      baseAmountUsd: Number(amountUsd || 0),
      currency: BASE_CURRENCY,
      rate: 1,
      localAmount: roundMoney(amountUsd, BASE_CURRENCY),
      capturedAt: new Date().toISOString(),
      source: "base currency",
      stale: false,
    };
  }

  const snapshot = await rates();
  const rate = Number(snapshot.rates[code]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new FxUnavailableError(`We do not have a current ${code} rate right now. Please pay in USD or try again.`);
  }
  const meta = PAYMENT_CURRENCIES[code];
  const localAmount = roundMoney(Number(amountUsd || 0) * rate, code);
  if (localAmount < meta.minimum) {
    const error = new Error(
      `${meta.name} payments must be at least ${meta.minimum} ${code}. Please pay in USD instead.`
    );
    error.status = 400;
    error.code = "AMOUNT_TOO_SMALL";
    throw error;
  }
  return {
    baseAmountUsd: Number(amountUsd || 0),
    currency: code,
    rate,
    localAmount,
    capturedAt: new Date(snapshot.at).toISOString(),
    source: snapshot.source,
    stale: Boolean(snapshot.stale),
  };
}

/* Public summary used by the pricing page and checkout to explain conversion. */
export async function publicRates() {
  try {
    const snapshot = await rates();
    return {
      base: BASE_CURRENCY,
      capturedAt: new Date(snapshot.at).toISOString(),
      stale: Boolean(snapshot.stale),
      rates: Object.fromEntries(
        Object.keys(PAYMENT_CURRENCIES).map((code) => [code, code === BASE_CURRENCY ? 1 : snapshot.rates[code] ?? null])
      ),
    };
  } catch {
    return { base: BASE_CURRENCY, capturedAt: null, stale: true, rates: {} };
  }
}
