import crypto from "node:crypto";
import { query, one } from "./db.js";
import { env } from "./env.js";
import { toMinorUnits } from "../shared/currencies.js";

/* Plan payments. A plan change never applies on its own: it creates an invoice,
   and the subscription moves only when that invoice is verified — instantly by
   Paystack, or with one click by an operator for a bank transfer. */

export const paystackEnabled = () => Boolean(env.payments.paystack.secretKey);

export const flutterwaveEnabled = () => Boolean(env.payments.flutterwave.secretKey);

/* Flutterwave is preferred when configured; Paystack remains the fallback, so
   an existing Paystack account keeps working untouched. */
export const onlineProvider = () =>
  flutterwaveEnabled() ? "flutterwave" : paystackEnabled() ? "paystack" : "";

export const onlineEnabled = () => Boolean(onlineProvider());

export const bankEnabled = () =>
  Boolean(env.payments.bank.accountNumber && env.payments.bank.accountName);

export const paymentMethodsConfigured = () => onlineEnabled() || bankEnabled();

export function paymentConfig() {
  return {
    online: onlineEnabled() ? { provider: onlineProvider() } : null,
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
  kind: row.kind || "plan",
  creditAmount: row.credit_amount == null ? null : Number(row.credit_amount),
  proration: row.proration || {},
  targetPlanId: row.target_plan_id || "",
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

/* Flutterwave's Standard API works the same way: the server creates a hosted
   checkout for the exact local amount and later verifies it by our own
   transaction reference. */
async function flutterwave(path, options = {}) {
  const response = await fetch(`${env.payments.flutterwave.apiUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.payments.flutterwave.secretKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    throw new Error(data.message || `Flutterwave responded with HTTP ${response.status}`);
  }
  return data.data || {};
}

export async function initializeFlutterwave({ email, payment, plan, callbackUrl }) {
  const currency = payment.payment_currency || "USD";
  const amount = Number(payment.local_amount ?? payment.amount);
  const reference = payment.reference;
  const data = await flutterwave("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: reference,
      amount,
      currency,
      redirect_url: callbackUrl,
      customer: { email },
      customizations: {
        title: "SBD Solutions",
        description: `${plan.name} plan`,
      },
      meta: {
        planId: plan.id,
        invoiceId: payment.id,
        baseAmountUsd: Number(payment.base_amount_usd ?? payment.amount),
        paymentCurrency: currency,
        localAmount: amount,
        fxRate: payment.fx_rate == null ? null : Number(payment.fx_rate),
      },
    }),
  });
  if (!data.link) throw new Error("Flutterwave did not return a payment link.");
  return { authorizationUrl: data.link, reference };
}

/* Flutterwave reports amounts in major units (e.g. 20,489.35 NGN), unlike
   Paystack's minor units. Both are normalised to a common shape so the
   invoice check is identical for either provider. */
export async function verifyFlutterwave(reference) {
  const data = await flutterwave(
    `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
  );
  const currency = String(data.currency || "").toUpperCase();
  return {
    status: data.status,
    amount: toMinorUnits(Number(data.amount || 0), currency || "USD"),
    currency,
    reference: data.tx_ref || reference,
    providerReference: data.id == null ? "" : String(data.id),
  };
}

/* One entry point for checkout, whichever provider is configured. */
export async function initializeOnlinePayment(options) {
  return onlineProvider() === "flutterwave"
    ? initializeFlutterwave(options)
    : initializePaystack(options);
}

export async function verifyOnlinePayment(payment) {
  if (onlineProvider() === "flutterwave") return verifyFlutterwave(payment.reference);
  const data = await verifyPaystack(payment.reference);
  return {
    status: data.status,
    amount: Number(data.amount),
    currency: String(data.currency || "").toUpperCase(),
    reference: data.reference || payment.reference,
    providerReference: data.reference || "",
  };
}

/* Providers report success differently; this keeps the route readable. */
export function providerSaysPaid(data) {
  const status = String(data?.status || "").toLowerCase();
  return status === "success" || status === "successful";
}

/* ---------- webhook signature verification ---------- */

/**
 * Verify a Paystack webhook signature. Paystack sends `x-paystack-signature`:
 * hex HMAC-SHA512 of the exact request body, keyed with the secret key.
 * The composite `t=…,v1=…` form is also accepted (it includes a timestamp), so
 * either signing scheme is validated. Returns the matching secret, or null.
 */
export function verifyPaystackSignature(rawBody, header, secrets, now = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== "string" || !header) return null;

  /* Plain hex form: the whole header is the signature over the raw body. */
  if (!header.includes("=")) {
    const hex = header.trim();
    if (!/^[0-9a-f]{128}$/i.test(hex)) return null;
    for (const secret of secrets) {
      if (!secret) continue;
      const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
      if (crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hex, "hex"))) return secret;
    }
    return null;
  }

  let t = null;
  const entries = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t") {
      if (t !== null || !/^[0-9]+$/.test(value)) return null;
      t = Number(value);
    } else if (key === "v1") {
      const j = value.indexOf(":");
      if (j !== -1) entries.push({ hex: value.slice(j + 1) });
    }
  }
  if (t === null || entries.length === 0) return null;
  if (Math.abs(now - t) > 300) return null;

  for (const secret of secrets) {
    if (!secret) continue;
    const expected = crypto
      .createHmac("sha512", secret)
      .update(`${t}.`)
      .update(rawBody)
      .digest("hex");
    for (const { hex } of entries) {
      if (!/^[0-9a-f]{128}$/.test(hex)) continue;
      if (crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hex, "hex"))) return secret;
    }
  }
  return null;
}

/**
 * Verify a Flutterwave webhook signature.
 * v3: `verif-hash` header equals the secret hash (body not covered).
 * v4: `flutterwave-signature` header is base64 HMAC-SHA256 of the raw body.
 * Returns true when the request is from Flutterwave.
 */
export function verifyFlutterwaveSignature(rawBody, headers, secretHash) {
  if (!secretHash) return false;
  const flwSig = headers["flutterwave-signature"];
  if (typeof flwSig === "string" && flwSig) {
    const expected = crypto
      .createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("base64");
    return (
      flwSig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(flwSig), Buffer.from(expected))
    );
  }
  const verifHash = headers["verif-hash"];
  if (typeof verifHash === "string" && verifHash) {
    return verifHash === secretHash;
  }
  return false;
}

/**
 * Activate a plan from a provider webhook. The invoice is matched by the
 * provider's transaction reference (our `SBD-…` invoice reference that we
 * passed as `tx_ref`/`reference` to the provider).
 *
 * This is intentionally separate from the customer-facing verify endpoint:
 * the webhook has no session, so it looks the payment up by reference alone
 * and only ever activates a pending invoice whose amount and currency match.
 */
export async function activatePaymentFromWebhook(payment, provider, data) {
  if (payment.status === "paid") return { activated: false, payment, message: "Already verified." };

  const providerReference = String(
    data?.id != null ? data.id : data?.tx_ref || data?.reference || ""
  );

  /* The same provider transaction must never pay two invoices, even when two
     webhook deliveries race. */
  if (providerReference) {
    const used = await one(
      "select id, reference from payments where provider = $1 and provider_reference = $2 and id <> $3 limit 1",
      [provider, providerReference, payment.id]
    );
    if (used) {
      return {
        activated: false,
        payment,
        message: `This ${provider} transaction already paid invoice ${used.reference}. Nothing was activated.`,
      };
    }
  }
  const currency = String(data?.currency || "").toUpperCase();
  /* Paystack reports minor units (kobo/cents); Flutterwave reports major units.
     Both are normalised to minor units before the invoice is compared. */
  const reported = Number(data?.charged_amount ?? data?.amount ?? 0);
  const paidMinor =
    provider === "flutterwave" ? toMinorUnits(reported, currency || "USD") : reported;

  const expectedCurrency = String(payment.payment_currency || payment.currency || "USD").toUpperCase();
  const expectedMinor = toMinorUnits(payment.local_amount ?? payment.amount, expectedCurrency);

  if (currency && currency !== expectedCurrency) {
    return {
      activated: false,
      payment,
      message: `Webhook currency ${currency} does not match the invoice (${expectedCurrency}). Nothing was activated; the SBD team will reconcile it.`,
    };
  }
  if (!Number.isFinite(paidMinor) || Math.abs(paidMinor - expectedMinor) > 1) {
    return {
      activated: false,
      payment,
      message: `Webhook amount does not match the invoice. Nothing was activated; the SBD team will reconcile it.`,
    };
  }

  await query(
    `update payments
        set provider = $2,
            provider_reference = $3,
            currency = coalesce(nullif(currency, ''), 'USD')
      where id = $1`,
    [payment.id, provider, providerReference]
  );

  const activated = await activatePayment(payment, { method: provider });
  const what =
    (payment.kind || "plan") === "credits"
      ? "your extra credits have been added"
      : (payment.kind || "plan") === "upgrade"
        ? "your upgrade is active now"
        : "the plan is active now";
  return { activated: true, payment: activated, message: `Payment received — ${what}.` };
}

/* Applies a verified invoice. Three kinds share this one entry point:
   - plan     : a new plan or a renewal — the period restarts and the plan's
                monthly allowance is reset (purchased credits are kept)
   - upgrade  : a mid-cycle move to a higher plan — the plan changes, the
                billing date and consumed usage are not reset
   - credits  : a one-off pack of extra credits, added exactly once
   Safe to call twice — an already-paid invoice is returned. */
export async function activatePayment(payment, { verifiedBy = null, method = "" } = {}) {
  if (payment.status === "paid") return payment;
  const kind = payment.kind || "plan";

  if (kind === "credits") {
    const credits = Number(payment.credit_amount || 0);
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new Error("This credit purchase has no credit amount.");
    }
    /* The unique index on payment_id is the idempotency lock: a duplicate
       webhook or a double click cannot add the credits twice. */
    const purchase = await one(
      `insert into credit_purchases (user_id, payment_id, package_id, credits, price, currency)
       values ($1, $2, null, $3, $4, $5)
       on conflict (payment_id) do nothing
       returning id`,
      [payment.user_id, payment.id, credits, Number(payment.amount || 0), payment.currency || "USD"]
    );
    if (purchase) {
      await query(
        `update subscriptions
            set bonus_credits = coalesce(bonus_credits, 0) + $2::numeric,
                updated_at = now()
          where user_id = $1`,
        [payment.user_id, credits]
      );
    }
  } else if (kind === "custom") {
    /* A verified custom offer is provisioned onto the existing subscription:
       one custom plan row carries the agreed allowances and the subscription
       points at it for the paid period. Accepting an offer alone never
       activates anything — this code only runs from a paid invoice (or an
       offer an operator explicitly marked zero-cost). */
    const offer = await one("select * from custom_offers where payment_id = $1", [payment.id]);
    if (!offer) throw new Error("The custom offer on this payment no longer exists.");

    if (offer.status !== "paid") {
      if (offer.billing_period === "one-off") {
        /* A one-off engagement has no recurring allowance to provision. */
        await query(
          `update custom_offers set status = 'paid', responded_at = coalesce(responded_at, now()), updated_at = now() where id = $1`,
          [offer.id]
        );
      } else {
        const planId = `custom-${String(offer.id).replace(/-/g, "").slice(0, 12)}`;
        const features = String(offer.included_features || "")
          .split(/[,\n]/)
          .map((line) => line.trim())
          .filter(Boolean);
        const credits = Math.max(0, Number(offer.credits || 0));
        const customers = Math.max(0, Number(offer.customer_limit || 0));
        const agents = Math.max(0, Number(offer.website_limit ?? offer.assistant_limit ?? 0));
        await query(
          `insert into plans
             (id, name, price, currency, assistant_limit, message_limit, token_limit, credit_limit,
              features, sort_order, custom, billing_note, token_price_hidden, underlying_cost,
              custom_request_id, unlimited_credits)
           values ($1,$2,$3,$4,$5,$6,0,$7,$8::jsonb,100,true,$9,true,null,$10,false)
           on conflict (id) do update
             set name = excluded.name, price = excluded.price, currency = excluded.currency,
                 assistant_limit = excluded.assistant_limit, message_limit = excluded.message_limit,
                 credit_limit = excluded.credit_limit, features = excluded.features,
                 billing_note = excluded.billing_note, custom_request_id = excluded.custom_request_id,
                 unlimited_credits = false`,
          [
            planId,
            offer.name,
            Number(offer.price),
            offer.currency || "USD",
            agents,
            customers,
            credits,
            JSON.stringify(features.length ? features : [`${credits.toLocaleString("en-US")} SBD AI credits`]),
            `${offer.currency || "USD"} ${Number(offer.price).toFixed(2)} per ${offer.billing_period === "annual" ? "year" : "month"} by agreement`,
            offer.request_id,
          ]
        );

        const interval = offer.billing_period === "annual" ? "365 days" : "30 days";
        /* The account may never have opened the dashboard, so the subscription
           row has to be created here as well as updated. A renewal extends
           from the current period end; a fresh activation starts today.
           Consumed credits and purchased credits are kept, so usage history is
           never wiped by a plan change. */
        await query(
          `insert into subscriptions (user_id, plan_id, status, current_period_end)
           values ($1, $2, 'active', now())
           on conflict (user_id) do nothing`,
          [payment.user_id, planId]
        );
        await query(
          `update subscriptions
              set plan_id = $2,
                  status = 'active',
                  cancel_at_period_end = false,
                  custom_activated_at = now(),
                  custom_previous_plan_id = coalesce(custom_previous_plan_id, plan_id),
                  current_period_end = greatest(current_period_end, now()) + interval '${interval}',
                  updated_at = now()
            where user_id = $1`,
          [payment.user_id, planId]
        );
      }

      await query(
        `update custom_offers set status = 'paid', responded_at = coalesce(responded_at, now()), updated_at = now() where id = $1`,
        [offer.id]
      );
      await query("update custom_requests set status = 'approved', updated_at = now() where id = $1", [
        offer.request_id,
      ]);
    }
  } else if (kind === "upgrade") {
    const planId = payment.target_plan_id || payment.plan_id;
    const plan = await one("select * from plans where id = $1", [planId]);
    if (!plan) throw new Error("The plan on this payment no longer exists.");
    /* An upgrade never silently resets allowances or the billing date. */
    await query(
      `update subscriptions
          set plan_id = $2,
              status = 'active',
              cancel_at_period_end = false,
              current_period_end = greatest(current_period_end, now() + interval '1 day'),
              updated_at = now()
        where user_id = $1`,
      [payment.user_id, plan.id]
    );
  } else {
    const plan = await one("select * from plans where id = $1", [payment.plan_id]);
    if (!plan) throw new Error("The plan on this payment no longer exists.");

    await query(
      `update subscriptions
          set plan_id = $2, status = 'active', cancel_at_period_end = false,
              current_period_end = now() + interval '30 days',
              period_start_at = now(),
              tokens_used = 0,
              /* A verified renewal is the only thing that resets the month's
                 SBD AI credits and internal API spend — never a refresh or a
                 new sign-in. Purchased credits are not plan credits, so they
                 survive the reset. */
              credits_used = 0,
              spending_used = 0,
              updated_at = now()
        where user_id = $1`,
      [payment.user_id, plan.id]
    );
  }

  const planRow = await one("select underlying_cost from plans where id = $1", [
    payment.target_plan_id || payment.plan_id,
  ]);
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
