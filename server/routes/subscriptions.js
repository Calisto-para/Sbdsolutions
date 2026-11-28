import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { currentPlan, subscriptionSummary } from "../plans.js";
import {
  activatePayment,
  checkProviderPayment,
  initializeOnlinePayment,
  newReference,
  onlineEnabled,
  onlineProvider,
  paymentConfig,
  paymentMethodsConfigured,
  paymentView,
  providerSaysPaid,
  verifyOnlinePayment,
} from "../payments.js";
import { quoteInCurrency, publicRates } from "../fx.js";
import { COUNTRIES, PAYMENT_CURRENCIES, currencyForCountry, findCountry, formatMoney } from "../../shared/currencies.js";

const router = express.Router();

async function paymentsFor(userId) {
  const rows = await query(
    `select id, plan_id, target_plan_id, kind, credit_amount, proration, amount, currency,
            base_amount_usd, base_currency, country,
            payment_currency, local_amount, fx_rate, fx_captured_at, fx_source,
            provider, provider_reference, status, method, description, reference, note,
            rejected_reason, verified_at, created_at
       from payments
      where user_id = $1
      order by created_at desc
      limit 50`,
    [userId]
  );
  return rows.map(paymentView);
}

/* Extra credit packs are configured by an operator. Nothing is purchasable
   until at least one active pack exists — the platform never invents a price
   or a quantity. */
async function activeCreditPackages() {
  const rows = await query(
    `select id, name, credits, price, currency, sort_order
       from credit_packages
      where active = true
      order by sort_order asc, credits asc`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    credits: Number(row.credits),
    price: Number(row.price),
    currency: row.currency || "USD",
  }));
}

/* Transparent mid-cycle upgrade maths.
   - the unused part of the current plan is credited back at the daily rate
   - the difference to the higher plan is charged once
   - the billing date does not move
   - consumed usage and purchased credits are never reset */
export function upgradeQuote({ currentPlan, newPlan, periodEnd, now = new Date() }) {
  const periodMs = 30 * 24 * 60 * 60 * 1000;
  const end = new Date(periodEnd || now.getTime() + periodMs);
  const remainingMs = Math.max(0, Math.min(periodMs, end.getTime() - now.getTime()));
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  const fraction = remainingMs / periodMs;
  const round = (value) => Math.round(value * 100) / 100;
  const unusedValue = round(Number(currentPlan?.price || 0) * fraction);
  const amountDue = Math.max(0, round(Number(newPlan?.price || 0) - unusedValue));
  return {
    fromPlanId: currentPlan?.id || "",
    toPlanId: newPlan?.id || "",
    remainingDays,
    unusedValue,
    amountDue,
    periodEnd: end.toISOString(),
    policy:
      "You pay only the difference for the days left in this billing period. Your renewal date stays the same, and your used credits and purchased credits are kept.",
  };
}

/* Country and currency options, plus when the current rates were captured.
   No account is needed: the pricing page uses this to explain conversion. */
router.get("/currencies", async (req, res, next) => {
  try {
    res.json({
      baseCurrency: "USD",
      countries: COUNTRIES,
      currencies: Object.values(PAYMENT_CURRENCIES),
      rates: await publicRates(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [summary, plans, payments] = await Promise.all([
      subscriptionSummary(req.user.id),
      query("select * from plans where custom = false order by sort_order asc"),
      paymentsFor(req.user.id),
    ]);

    res.json({
      ...summary,
      creditPackages: await activeCreditPackages(),
      upgradePolicy:
        "Upgrading charges only the difference for the days left in your current billing period. Your renewal date does not change, and used or purchased credits are kept.",
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        currency: plan.currency,
        assistantLimit: plan.assistant_limit,
        messageLimit: plan.message_limit,
        features: Array.isArray(plan.features) ? plan.features : [],
        custom: Boolean(plan.custom),
        billingNote: plan.billing_note || "",
      })),
      payments,
      paymentConfig: paymentConfig(),
    });
  } catch (error) {
    next(error);
  }
});

/* Choosing a plan creates an invoice. It does not change the plan — that waits
   until the money is verified. */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        planId: z.string().trim().min(2).max(40),
        country: z.string().trim().max(2).optional().default(""),
        currency: z.string().trim().max(3).optional().default(""),
      })
      .parse(req.body);
    const { planId } = input;
    const country = findCountry(input.country);
    const paymentCurrency = input.currency
      ? input.currency.toUpperCase()
      : currencyForCountry(country?.code);
    const plan = await one("select * from plans where id = $1", [planId]);
    if (!plan) return res.status(404).json({ error: "That plan does not exist." });
    if (plan.custom) {
      return res.status(400).json({
        error:
          "Enterprise is priced per agreement. Message us on WhatsApp (+234 906 392 4288) and we will set up monthly or agreed billing with you.",
        code: "CUSTOM_PLAN",
      });
    }
    if (!paymentMethodsConfigured()) {
      return res.status(503).json({
        error:
          "Payments are not set up yet. Message us on WhatsApp (+234 906 392 4288) and we will take your payment and activate the plan.",
        code: "PAYMENT_NOT_CONFIGURED",
      });
    }

    const { subscription } = await currentPlan(req.user.id);
    if (subscription.plan_id === plan.id && subscription.status === "active" && !subscription.cancel_at_period_end) {
      return res.status(400).json({ error: `You are already on the ${plan.name} plan.` });
    }

    /* The price list is in USD. Convert it to the currency this customer will
       actually be charged, with a live rate captured now. */
    const quote = await quoteInCurrency(plan.price, paymentCurrency);

    /* One open invoice per plan, so double-clicking does not create duplicates. */
    const open = await one(
      `select * from payments
        where user_id = $1 and plan_id = $2 and status = 'pending'
        order by created_at desc
        limit 1`,
      [req.user.id, plan.id]
    );

    /* Show the plan price to the customer. The underlying cost is kept
       internal only — customers never see the $3/$10/$25 token cost. */
    const customerAmount = Number(plan.price);
    const underlyingCost = plan.underlying_cost ? Number(plan.underlying_cost) : null;
    const description = `${plan.name} plan — USD ${customerAmount.toFixed(2)} per month`;
    const reference = newReference();

    const payment = open
      ? await one(
          `update payments
              set country = $2,
                  payment_currency = $3,
                  local_amount = $4,
                  fx_rate = $5,
                  fx_captured_at = $6,
                  fx_source = $7,
                  reference = case when payment_currency <> $3 or local_amount is distinct from $4 then $8 else reference end,
                  base_amount_usd = coalesce(base_amount_usd, amount),
                  base_currency = 'USD'
            where id = $1
            returning *`,
          [
            open.id,
            country?.code || "",
            quote.currency,
            quote.localAmount,
            quote.rate,
            quote.capturedAt,
            quote.source,
            reference,
          ]
        )
      : await one(
          `insert into payments
             (user_id, plan_id, amount, currency, base_amount_usd, base_currency, country,
              payment_currency, local_amount, fx_rate, fx_captured_at, fx_source,
              status, method, description, reference, charged_amount, token_limit, underlying_cost, provider)
           values ($1, $2, $3, 'USD', $3, 'USD', $4, $5, $6, $7, $8, $9,
                   'pending', $10, $11, $12, $13, $14, $15, $16)
           returning *`,
          [
            req.user.id,
            plan.id,
            customerAmount,
            country?.code || "",
            quote.currency,
            quote.localAmount,
            quote.rate,
            quote.capturedAt,
            quote.source,
            onlineEnabled() ? onlineProvider() : "transfer",
            description,
            reference,
            customerAmount,
            plan.token_limit,
            underlyingCost,
            onlineEnabled() ? onlineProvider() : "",
          ]
        );

    let authorizationUrl = "";
    let onlineError = "";

    if (onlineEnabled()) {
      try {
        const init = await initializeOnlinePayment({
          email: req.user.email,
          payment,
          plan,
          callbackUrl: `${env.appUrl}/dashboard?tab=subscriptions&payment=${payment.id}`,
        });
        authorizationUrl = init.authorizationUrl;
      } catch (error) {
        console.error(`[payments] ${onlineProvider()} initialize failed:`, error.message);
        onlineError = /currency/i.test(error.message || "")
          ? `Your ${onlineProvider()} account is not enabled to charge ${quote.currency}. Use the bank transfer details below, or pay in USD. (${error.message})`
          : error.message;
      }
    }

    const checkout = {
      planId: plan.id,
      planName: plan.name,
      baseAmountUsd: quote.baseAmountUsd,
      baseCurrency: "USD",
      country: country?.code || "",
      countryName: country?.name || "",
      paymentCurrency: quote.currency,
      localAmount: quote.localAmount,
      fxRate: quote.rate,
      fxCapturedAt: quote.capturedAt,
      fxSource: quote.source,
      fxStale: quote.stale,
      local: quote.currency !== "USD",
      methods: paymentConfig(),
    };

    res.status(201).json({
      payment: paymentView(payment),
      checkout,
      paymentConfig: paymentConfig(),
      authorizationUrl,
      onlineError,
      message: authorizationUrl
        ? `Invoice ${payment.reference} created. Pay ${formatMoney(quote.localAmount, quote.currency)} (USD ${customerAmount.toFixed(2)}) to activate the ${plan.name} plan — online payments are confirmed instantly.`
        : paymentConfig().bank
          ? `Invoice ${payment.reference} created. Pay ${formatMoney(quote.localAmount, quote.currency)} (USD ${customerAmount.toFixed(2)}) by bank transfer and submit your reference; the SBD team verifies it and your plan activates.`
          : `Invoice ${payment.reference} created, but the online payment page could not be opened${onlineError ? ` (${onlineError})` : ""}. Message us on WhatsApp (+234 906 392 4288) and we will take your payment and activate the plan.`,
      ...(await subscriptionSummary(req.user.id)),
    });
  } catch (error) {
    next(error);
  }
});

/* Instant confirmation for an online payment: ask the provider, then activate. */
router.post("/payments/:id/verify", requireAuth, async (req, res, next) => {
  try {
    const payment = await one("select * from payments where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (payment.status === "paid") {
      return res.json({ ...(await subscriptionSummary(req.user.id)), payments: await paymentsFor(req.user.id), message: "This payment is already verified." });
    }
    if (!onlineEnabled()) {
      return res.status(400).json({
        error: "Online confirmation is not available. Submit your transfer reference and the team will verify it.",
        code: "NO_ONLINE_VERIFICATION",
      });
    }

    const provider = onlineProvider();
    const data = await verifyOnlinePayment(payment);
    const paid = providerSaysPaid(data);
    if (!paid) {
      return res.status(400).json({
        error: "The payment has not been completed yet. Finish the payment and try again.",
        code: "PAYMENT_NOT_COMPLETED",
      });
    }

    /* Reference, currency and amount must all match the invoice shown to the
       customer. A mismatch never activates a plan. */
    const check = checkProviderPayment(payment, data);
    if (!check.ok) {
      console.error(`[payments] verification refused for ${payment.reference}: ${check.code}`);
      return res.status(400).json({ error: check.error, code: check.code });
    }

    const providerReference = String(data.providerReference || data.reference || payment.reference);
    /* One provider transaction can only pay one invoice. */
    const used = await one(
      "select id, reference from payments where provider = $1 and provider_reference = $2 and id <> $3 limit 1",
      [provider, providerReference, payment.id]
    );
    if (used) {
      console.error(`[payments] provider reference ${providerReference} already paid invoice ${used.reference}`);
      return res.status(409).json({
        error: `That ${provider} payment has already been used for another invoice (${used.reference}). Nothing was activated; the SBD team will reconcile it.`,
        code: "PAYMENT_ALREADY_USED",
      });
    }

    await query(
      `update payments
          set provider = $3,
              provider_reference = $2,
              currency = coalesce(nullif(currency, ''), 'USD')
        where id = $1`,
      [payment.id, providerReference, provider]
    );
    await activatePayment({ ...payment, status: payment.status }, { method: provider });
    res.json({
      ...(await subscriptionSummary(req.user.id)),
      payments: await paymentsFor(req.user.id),
      message: `Payment received — your plan is active now.`,
    });
  } catch (error) {
    console.error("[payments] verify failed:", error.message);
    res.status(502).json({
      error: "We could not confirm that payment with the provider just now. Try again in a minute.",
      code: "VERIFY_FAILED",
    });
  }
});

/* Bank transfer: the customer submits the reference they used. */
router.post("/payments/:id/submit", requireAuth, async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().trim().min(3, "Enter the transfer reference.").max(300) }).parse(req.body);
    const payment = await one("select * from payments where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (payment.status === "paid") {
      return res.json({ ...(await subscriptionSummary(req.user.id)), payments: await paymentsFor(req.user.id), message: "This payment is already verified." });
    }

    const updated = await one(
      `update payments
          set note = $2, method = 'transfer', status = 'pending', rejected_reason = ''
        where id = $1
        returning *`,
      [payment.id, note]
    );

    res.json({
      payment: paymentView(updated),
      payments: await paymentsFor(req.user.id),
      message:
        "Reference received. The SBD team checks it and verifies the payment — your plan activates as soon as it is confirmed.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    await currentPlan(req.user.id);
    await query(
      `update subscriptions
          set cancel_at_period_end = true, status = 'canceled', updated_at = now()
        where user_id = $1`,
      [req.user.id]
    );
    const summary = await subscriptionSummary(req.user.id);
    res.json({
      ...summary,
      payments: await paymentsFor(req.user.id),
      message: `Your ${summary.plan?.name || "current"} plan is cancelled. It stays available until ${new Date(
        summary.currentPeriodEnd
      ).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`,
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- upgrades ---------- */

async function paymentCurrencyFor(input) {
  const country = findCountry(input.country);
  const currency = input.currency
    ? input.currency.toUpperCase()
    : currencyForCountry(country?.code);
  return { country, currency };
}

router.get("/upgrade-quote", requireAuth, async (req, res, next) => {
  try {
    const planId = z.string().trim().min(2).max(40).parse(String(req.query.planId || ""));
    const { country, currency } = await paymentCurrencyFor({
      country: String(req.query.country || ""),
      currency: String(req.query.currency || ""),
    });
    const [{ subscription, plan }, target] = await Promise.all([
      currentPlan(req.user.id),
      one("select * from plans where id = $1", [planId]),
    ]);
    if (!target) return res.status(404).json({ error: "That plan does not exist." });
    if (target.custom) {
      return res.status(400).json({ error: "Enterprise is priced per agreement. Contact us to arrange an upgrade.", code: "CUSTOM_PLAN" });
    }
    if (Number(target.price) <= Number(plan?.price || 0)) {
      return res.status(400).json({ error: "Choose a higher plan to upgrade. Downgrades take effect at renewal.", code: "NOT_AN_UPGRADE" });
    }

    const quote = upgradeQuote({ currentPlan: plan, newPlan: target, periodEnd: subscription.current_period_end });
    const fx = await quoteInCurrency(quote.amountDue, currency);
    res.json({
      current: { id: plan?.id, name: plan?.name, price: Number(plan?.price || 0) },
      target: { id: target.id, name: target.name, price: Number(target.price), currency: target.currency },
      quote,
      paymentCurrency: fx.currency,
      localAmount: fx.localAmount,
      fxRate: fx.rate,
      country: country?.code || "",
      credits: {
        used: Number(subscription.credits_used || 0),
        allowance: target.credit_limit == null ? null : Number(target.credit_limit),
      },
      customers: {
        used: (await subscriptionSummary(req.user.id)).usage.customers,
        limit: target.message_limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* Creates one invoice for the prorated difference. Nothing changes until the
   payment is verified by the provider or the operator. */
router.post("/upgrade", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        planId: z.string().trim().min(2).max(40),
        country: z.string().trim().max(2).optional().default(""),
        currency: z.string().trim().max(3).optional().default(""),
      })
      .parse(req.body);

    const { country, currency } = await paymentCurrencyFor(input);
    const [{ subscription, plan }, target] = await Promise.all([
      currentPlan(req.user.id),
      one("select * from plans where id = $1", [input.planId]),
    ]);
    if (!target) return res.status(404).json({ error: "That plan does not exist." });
    if (target.custom) {
      return res.status(400).json({ error: "Enterprise is priced per agreement. Contact us to arrange an upgrade.", code: "CUSTOM_PLAN" });
    }
    if (Number(target.price) <= Number(plan?.price || 0)) {
      return res.status(400).json({ error: "Choose a higher plan to upgrade. Downgrades take effect at renewal.", code: "NOT_AN_UPGRADE" });
    }
    if (!paymentMethodsConfigured()) {
      return res.status(503).json({
        error: "Payments are not set up yet. Message us on WhatsApp (+234 906 392 4288) and we will arrange the upgrade.",
        code: "PAYMENT_NOT_CONFIGURED",
      });
    }

    const quote = upgradeQuote({ currentPlan: plan, newPlan: target, periodEnd: subscription.current_period_end });
    if (!(quote.amountDue > 0)) {
      return res.status(400).json({ error: "There is nothing to charge for this upgrade. Contact support and we will apply it.", code: "NOTHING_DUE" });
    }
    const fx = await quoteInCurrency(quote.amountDue, currency);

    const description = `Upgrade from ${plan?.name || "your plan"} to ${target.name} — prorated for ${quote.remainingDays} day(s) remaining`;
    const reference = newReference();

    /* One open upgrade invoice per target plan: a double click cannot create
       two charges. */
    const open = await one(
      `select * from payments
        where user_id = $1 and target_plan_id = $2 and kind = 'upgrade' and status = 'pending'
        order by created_at desc limit 1`,
      [req.user.id, target.id]
    );

    const payment = open
      ? await one(
          `update payments
              set amount = $2, base_amount_usd = $2, currency = 'USD',
                  country = $3, payment_currency = $4, local_amount = $5,
                  fx_rate = $6, fx_captured_at = $7, fx_source = $8,
                  proration = $9::jsonb, description = $10,
                  reference = case when payment_currency <> $4 or local_amount is distinct from $5 then $11 else reference end
            where id = $1
            returning *`,
          [
            open.id,
            quote.amountDue,
            country?.code || "",
            fx.currency,
            fx.localAmount,
            fx.rate,
            fx.capturedAt,
            fx.source,
            JSON.stringify(quote),
            description,
            reference,
          ]
        )
      : await one(
          `insert into payments
             (user_id, plan_id, target_plan_id, kind, amount, currency, base_amount_usd,
              base_currency, country, payment_currency, local_amount, fx_rate, fx_captured_at,
              fx_source, status, method, description, reference, charged_amount, proration, provider)
           values ($1, $2, $2, 'upgrade', $3, 'USD', $3, 'USD', $4, $5, $6, $7, $8, $9,
                   'pending', $10, $11, $12, $3, $13::jsonb, $14)
           returning *`,
          [
            req.user.id,
            target.id,
            quote.amountDue,
            country?.code || "",
            fx.currency,
            fx.localAmount,
            fx.rate,
            fx.capturedAt,
            fx.source,
            onlineEnabled() ? onlineProvider() : "transfer",
            description,
            reference,
            JSON.stringify(quote),
            onlineEnabled() ? onlineProvider() : "",
          ]
        );

    let authorizationUrl = "";
    let onlineError = "";
    if (onlineEnabled()) {
      try {
        const init = await initializeOnlinePayment({
          email: req.user.email,
          payment,
          plan: target,
          callbackUrl: `${env.appUrl}/dashboard?tab=usage&payment=${payment.id}`,
        });
        authorizationUrl = init.authorizationUrl;
      } catch (error) {
        console.error(`[payments] upgrade initialize failed:`, error.message);
        onlineError = error.message;
      }
    }

    res.status(201).json({
      payment: paymentView(payment),
      quote,
      authorizationUrl,
      onlineError,
      message: authorizationUrl
        ? `Upgrade to ${target.name} ready. Pay the prorated difference and it activates instantly once confirmed.`
        : `Upgrade invoice ${payment.reference} created. It activates once the payment is verified.`,
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- additional credits ---------- */

/* Purchasing stays disabled until an operator has configured a package. */
router.post("/credits/:packageId/purchase", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({
        country: z.string().trim().max(2).optional().default(""),
        currency: z.string().trim().max(3).optional().default(""),
      })
      .parse(req.body || {});

    const pack = await one("select * from credit_packages where id = $1 and active = true", [
      req.params.packageId,
    ]);
    if (!pack) {
      return res.status(404).json({
        error: "That credit pack is not available. Credit purchases open once the SBD team configures them.",
        code: "PACKAGE_UNAVAILABLE",
      });
    }
    if (!paymentMethodsConfigured()) {
      return res.status(503).json({
        error: "Payments are not set up yet. Message us on WhatsApp (+234 906 392 4288) and we will add credits for you.",
        code: "PAYMENT_NOT_CONFIGURED",
      });
    }

    const { country, currency } = await paymentCurrencyFor(input);
    const { plan } = await currentPlan(req.user.id);
    const fx = await quoteInCurrency(Number(pack.price), currency);
    const credits = Number(pack.credits);
    const description = `${credits.toLocaleString("en-GB")} additional SBD AI credits`;
    const reference = newReference();

    const open = await one(
      `select * from payments
        where user_id = $1 and kind = 'credits' and credit_amount = $2 and status = 'pending'
        order by created_at desc limit 1`,
      [req.user.id, credits]
    );

    const payment = open
      ? await one(
          `update payments
              set amount = $2, base_amount_usd = $2, currency = 'USD', country = $3,
                  payment_currency = $4, local_amount = $5, fx_rate = $6,
                  fx_captured_at = $7, fx_source = $8, description = $9,
                  reference = case when payment_currency <> $4 or local_amount is distinct from $5 then $10 else reference end
            where id = $1
            returning *`,
          [open.id, Number(pack.price), country?.code || "", fx.currency, fx.localAmount, fx.rate, fx.capturedAt, fx.source, description, reference]
        )
      : await one(
          `insert into payments
             (user_id, plan_id, kind, credit_amount, amount, currency, base_amount_usd,
              base_currency, country, payment_currency, local_amount, fx_rate, fx_captured_at,
              fx_source, status, method, description, reference, charged_amount, provider)
           values ($1, $2, 'credits', $3, $4, 'USD', $4, 'USD', $5, $6, $7, $8, $9, $10,
                   'pending', $11, $12, $13, $4, $14)
           returning *`,
          [
            req.user.id,
            plan?.id || "starter",
            credits,
            Number(pack.price),
            country?.code || "",
            fx.currency,
            fx.localAmount,
            fx.rate,
            fx.capturedAt,
            fx.source,
            onlineEnabled() ? onlineProvider() : "transfer",
            description,
            reference,
            onlineEnabled() ? onlineProvider() : "",
          ]
        );

    let authorizationUrl = "";
    let onlineError = "";
    if (onlineEnabled()) {
      try {
        const init = await initializeOnlinePayment({
          email: req.user.email,
          payment,
          plan: { id: plan?.id || "starter", name: description },
          callbackUrl: `${env.appUrl}/dashboard?tab=usage&payment=${payment.id}`,
        });
        authorizationUrl = init.authorizationUrl;
      } catch (error) {
        console.error("[payments] credit purchase initialize failed:", error.message);
        onlineError = error.message;
      }
    }

    res.status(201).json({
      payment: paymentView(payment),
      credits,
      price: Number(pack.price),
      paymentCurrency: fx.currency,
      localAmount: fx.localAmount,
      authorizationUrl,
      onlineError,
      message: authorizationUrl
        ? `${credits.toLocaleString("en-GB")} credits ready to buy. They are added the moment the payment is confirmed.`
        : `Invoice ${payment.reference} created. The credits are added once the payment is verified.`,
    });
  } catch (error) {
    next(error);
  }
});

/* Printable receipt for one payment. Only the owner (or an operator) can read
   it; it always reflects the stored payment row and any refund on it. */
router.get("/payments/:id/receipt", async (req, res, next) => {
  try {
    const payment = await one(
      `select p.*, u.full_name, u.email, u.business_name, pl.name as plan_name
         from payments p
         join users u on u.id = p.user_id
         left join plans pl on pl.id = p.plan_id
        where p.id = $1`,
      [req.params.id]
    );
    if (!payment) return res.status(404).send("Receipt not found.");
    if (payment.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(404).send("Receipt not found.");
    }
    const refund = await one("select amount, currency, reason, created_at from refunds where payment_id = $1", [
      payment.id,
    ]);
    const money = (value, currency) =>
      `${currency || "USD"} ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const esc = (value) =>
      String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const date = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "—");
    const status = refund ? "Refunded" : payment.status;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${esc(payment.reference || payment.id)}</title>
<style>
 body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:0;padding:40px;background:#f8fafc}
 .sheet{max-width:720px;margin:0 auto;background:#fff;padding:40px;border:1px solid #e2e8f0;border-radius:12px}
 h1{font-size:20px;margin:0 0 4px} .muted{color:#64748b;font-size:13px}
 table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
 th,td{padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:left}
 th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
 .total{font-size:18px;font-weight:700} .foot{margin-top:28px;font-size:12px;color:#64748b;line-height:1.6}
 @media print{body{background:#fff;padding:0}.sheet{border:0}}
</style></head><body><div class="sheet">
<h1>SBD Solutions</h1>
<div class="muted">Receipt ${esc(payment.reference || payment.id)} · issued ${date(payment.created_at)}</div>
<p><strong>${esc(payment.business_name || payment.full_name)}</strong><br /><span class="muted">${esc(payment.email)}</span></p>
<table>
<tr><th>Description</th><th>Date</th><th>Amount</th></tr>
<tr><td>${esc(payment.plan_name || payment.plan_id)}${payment.kind === "credits" ? " — extra credits" : ""}${payment.kind === "custom" ? " — custom agreement" : ""}</td><td>${date(payment.created_at)}</td><td>${money(payment.amount, payment.currency)}</td></tr>
${refund ? `<tr><td>Refund — ${esc(refund.reason || "operator refund")}</td><td>${date(refund.created_at)}</td><td>-${money(refund.amount, refund.currency)}</td></tr>` : ""}
<tr><td class="total">Total ${esc(status === "Refunded" ? "refunded" : "paid")}</td><td></td><td class="total">${money(refund ? Number(payment.amount) - Number(refund.amount) : payment.amount, payment.currency)}</td></tr>
</table>
<p class="muted">Status: ${esc(status)}${payment.verified_at ? ` · verified ${date(payment.verified_at)}` : ""}${payment.method ? ` · method ${esc(payment.method)}` : ""}</p>
<div class="foot">SBD Solutions · support@sbd.solutions<br />
This receipt reflects the payment record held on your account. Refunds are processed by the original payment method.</div>
</div></body></html>`;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    next(error);
  }
});

export default router;
