import crypto from "node:crypto";
import { query, one } from "./db.js";
import { env } from "./env.js";
import { toMinorUnits } from "../shared/currencies.js";

/* Plan payments. A plan change never applies on its own: it creates an invoice,
   and the subscription moves only when that invoice is verified — instantly by
   Paystack, or with one click by an operator for a bank transfer. */

export const paystackEnabled = () => Boolean(env.payments.paystack.secretKey);

export const bankEnabled = () =>
  Boolean(env.payments.bank.accountNumber && env.payments.bank.accountName);

export const paymentMethodsConfigured = () => paystackEnabled() || bankEnabled();

export function paymentConfig() {
  return {
    online: paystackEnabled() ? { provider: "paystack" } : null,
    bank: bankEnabled()
      ? {
          name: env.payments.bank.name,
          accountName: env.payments.bank.accountName,
          accountNumber: env.payments.bank.accountNumber,
          instructions: env.payments.bank.instructions,
        }
      : null,
  };
}

export function newReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SBD-${stamp}-${suffix}`;
}

export const paymentView = (row) => ({
  id: row.id,
  planId: row.plan_id,
  /* `amount`/`currency` are the official USD price and never change. */
  amount: Number(row.amount),
  currency: row.currency || "USD",
  baseAmountUsd: Number(row.base_amount_usd ?? row.amount ?? 0),
  baseCurrency: row.base_currency || "USD",
  country: row.country || "",
  paymentCurrency: row.payment_currency || row.currency || "USD",
  localAmount: row.local_amount == null ? null : Number(row.local_amount),
  fxRate: row.fx_rate == null ? null : Number(row.fx_rate),
  fxCapturedAt: row.fx_captured_at || null,
  fxSource: row.fx_source || "",
  provider: row.provider || "",
  providerReference: row.provider_reference || "",
  status: row.status,
  method: row.method,
  description: row.description,
  reference: row.reference || "",
  note: row.note || "",
  rejectedReason: row.rejected_reason || "",
  verifiedAt: row.verified_at,
  createdAt: row.created_at,
  chargedAmount: row.charged_amount ? Number(row.charged_amount) : null,
  tokenLimit: row.token_limit,
  underlyingCost: row.underlying_cost ? Number(row.underlying_cost) : null,
});

async function paystack(path, options = {}) {
  const response = await fetch(`${env.payments.paystack.apiUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.payments.paystack.secretKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === false) {
    throw new Error(data.message || `Paystack responded with HTTP ${response.status}`);
  }
  return data.data || {};
}

/* Charge the local amount the customer was shown, in the currency they were
   shown, with the reference recorded on the invoice. The USD price stays the
   official value; nothing here rewrites it. */
export async function initializePaystack({ email, payment, plan, callbackUrl }) {
  const currency = payment.payment_currency || "USD";
  const amount = toMinorUnits(payment.local_amount ?? payment.amount, currency);
  const reference = payment.reference;
  const data = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        planId: plan.id,
        planName: plan.name,
        invoiceId: payment.id,
        baseAmountUsd: Number(payment.base_amount_usd ?? payment.amount),
        paymentCurrency: currency,
        localAmount: Number(payment.local_amount ?? payment.amount),
        fxRate: payment.fx_rate == null ? null : Number(payment.fx_rate),
      },
    }),
  });
  if (!data.authorization_url) throw new Error("Paystack did not return a payment link.");
  return { authorizationUrl: data.authorization_url, reference: data.reference || reference };
}

export async function verifyPaystack(reference) {
  return paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/* Applies a verified invoice: the subscription moves to the paid plan and the
   payment is closed. Safe to call twice — an already-paid invoice is returned. */
export async function activatePayment(payment, { verifiedBy = null, method = "" } = {}) {
  if (payment.status === "paid") return payment;

  const plan = await one("select * from plans where id = $1", [payment.plan_id]);
  if (!plan) throw new Error("The plan on this payment no longer exists.");

  await query(
    `update subscriptions
        set plan_id = $2, status = 'active', cancel_at_period_end = false,
            current_period_end = now() + interval '30 days',
            tokens_used = 0, updated_at = now()
      where user_id = $1`,
    [payment.user_id, plan.id]
  );

  const planRow = await one("select underlying_cost from plans where id = $1", [payment.plan_id]);
  const updated = await one(
    `update payments
        set status = 'paid',
            method = case when $2::text = '' then method else $2::text end,
            verified_at = now(),
            verified_by = $3::uuid,
            rejected_reason = '',
            underlying_cost = $4
      where id = $1
      returning *`,
    [payment.id, method, verifiedBy, planRow?.underlying_cost ?? null]
  );
  return updated || payment;
}

/* Provider verification. The reference, currency and amount must all match the
   invoice the customer was shown. Anything else is refused — a payment in a
   different currency or for a different amount never activates a plan. */
export function checkProviderPayment(payment, data) {
  const currency = String(data?.currency || "").toUpperCase();
  const expectedCurrency = String(payment.payment_currency || payment.currency || "USD").toUpperCase();
  const paidMinor = Number(data?.amount);
  const expectedMinor = toMinorUnits(payment.local_amount ?? payment.amount, expectedCurrency);

  if (String(payment.reference || "") && String(data?.reference || "") && data.reference !== payment.reference) {
    return { ok: false, code: "REFERENCE_MISMATCH", error: "The payment reference does not match this invoice. Nothing was activated; the SBD team will reconcile it." };
  }
  if (currency && currency !== expectedCurrency) {
    return {
      ok: false,
      code: "CURRENCY_MISMATCH",
      error: `The provider charged ${currency} but this invoice is in ${expectedCurrency}. Nothing was activated; the SBD team will reconcile it.`,
    };
  }
  if (!Number.isFinite(paidMinor) || Math.abs(paidMinor - expectedMinor) > 1) {
    return {
      ok: false,
      code: "AMOUNT_MISMATCH",
      error: "The amount paid does not match this invoice. Nothing was activated; message us on WhatsApp (+234 906 392 4288) so we can check it.",
    };
  }
  return { ok: true };
}
