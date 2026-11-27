import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { currentPlan, subscriptionSummary } from "../plans.js";
import {
  activatePayment,
  checkProviderPayment,
  initializePaystack,
  newReference,
  paystackEnabled,
  paymentConfig,
  paymentMethodsConfigured,
  paymentView,
  verifyPaystack,
} from "../payments.js";
import { quoteInCurrency, publicRates } from "../fx.js";
import { COUNTRIES, PAYMENT_CURRENCIES, currencyForCountry, findCountry, formatMoney } from "../../shared/currencies.js";

const router = express.Router();

async function paymentsFor(userId) {
  const rows = await query(
    `select id, plan_id, amount, currency, base_amount_usd, base_currency, country,
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
      query("select * from plans order by sort_order asc"),
      paymentsFor(req.user.id),
    ]);

    res.json({
      ...summary,
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
              status, method, description, reference, charged_amount, token_limit, underlying_cost)
           values ($1, $2, $3, 'USD', $3, 'USD', $4, $5, $6, $7, $8, $9,
                   'pending', $10, $11, $12, $13, $14, $15)
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
            paystackEnabled() ? "paystack" : "transfer",
            description,
            reference,
            customerAmount,
            plan.token_limit,
            underlyingCost,
          ]
        );

    let authorizationUrl = "";
    let onlineError = "";

    if (paystackEnabled()) {
      try {
        const init = await initializePaystack({
          email: req.user.email,
          payment,
          plan,
          callbackUrl: `${env.appUrl}/dashboard?tab=subscriptions&payment=${payment.id}`,
        });
        authorizationUrl = init.authorizationUrl;
      } catch (error) {
        console.error("[payments] paystack initialize failed:", error.message);
        onlineError = /currency/i.test(error.message || "")
          ? `Your Paystack account is not enabled to charge ${quote.currency}. Use the bank transfer details below, or pay in USD. (${error.message})`
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
        : `Invoice ${payment.reference} created. Pay ${formatMoney(quote.localAmount, quote.currency)} (USD ${customerAmount.toFixed(2)}) by bank transfer and submit your reference; the SBD team verifies it and your plan activates.`,
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
    if (!paystackEnabled()) {
      return res.status(400).json({
        error: "Online confirmation is not available. Submit your transfer reference and the team will verify it.",
        code: "NO_ONLINE_VERIFICATION",
      });
    }

    const data = await verifyPaystack(payment.reference);
    const paid = String(data.status || "").toLowerCase() === "success";
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

    await query(
      `update payments
          set provider = 'paystack',
              provider_reference = $2,
              currency = coalesce(nullif(currency, ''), 'USD')
        where id = $1`,
      [payment.id, String(data.reference || payment.reference)]
    );
    await activatePayment({ ...payment, status: payment.status }, { method: "paystack" });
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

export default router;
