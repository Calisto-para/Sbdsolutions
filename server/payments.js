import crypto from "node:crypto";
import { query, one } from "./db.js";
import { env } from "./env.js";

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
  amount: Number(row.amount),
  currency: row.currency,
  status: row.status,
  method: row.method,
  description: row.description,
  reference: row.reference || "",
  note: row.note || "",
  rejectedReason: row.rejected_reason || "",
  verifiedAt: row.verified_at,
  createdAt: row.created_at,
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

export async function initializePaystack({ email, plan, reference, callbackUrl }) {
  const currency = env.payments.paystack.currency || plan.currency;
  const data = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: Math.round(Number(plan.price) * 100),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: { planId: plan.id, planName: plan.name },
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
            current_period_end = now() + interval '30 days', updated_at = now()
      where user_id = $1`,
    [payment.user_id, plan.id]
  );

  const updated = await one(
    `update payments
        set status = 'paid',
            method = case when $2::text = '' then method else $2::text end,
            verified_at = now(),
            verified_by = $3::uuid,
            rejected_reason = ''
      where id = $1
      returning *`,
    [payment.id, method, verifiedBy]
  );
  return updated || payment;
}

/* Amount check for a provider response, tolerating minor-unit rounding. */
export const amountMatches = (payment, paidMinor) =>
  Math.abs(Number(paidMinor) / 100 - Number(payment.amount)) < 0.02;
