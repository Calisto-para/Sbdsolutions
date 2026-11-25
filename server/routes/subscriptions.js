import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { currentPlan, subscriptionSummary } from "../plans.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [summary, plans, payments] = await Promise.all([
      subscriptionSummary(req.user.id),
      query("select * from plans order by sort_order asc"),
      query(
        "select id, plan_id, amount, currency, status, method, description, created_at from payments where user_id = $1 order by created_at desc limit 50",
        [req.user.id]
      ),
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
      payments: payments.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        amount: Number(row.amount),
        currency: row.currency,
        status: row.status,
        method: row.method,
        description: row.description,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* Plan changes take effect immediately. Payment is settled offline, so a paid
   plan records the amount due instead of pretending a card was charged. */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { planId } = z.object({ planId: z.string().trim().min(2).max(40) }).parse(req.body);
    const plan = await one("select * from plans where id = $1", [planId]);
    if (!plan) return res.status(404).json({ error: "That plan does not exist." });
    if (plan.custom) {
      return res.status(400).json({
        error:
          "Enterprise is priced per agreement. Message us on WhatsApp (+234 906 392 4288) and we will set up monthly or agreed billing with you.",
        code: "CUSTOM_PLAN",
      });
    }

    const { subscription } = await currentPlan(req.user.id);
    if (subscription.plan_id === plan.id && !subscription.cancel_at_period_end) {
      return res.status(400).json({ error: `You are already on the ${plan.name} plan.` });
    }

    await query(
      `update subscriptions
          set plan_id = $2, status = 'active', cancel_at_period_end = false,
              updated_at = now()
        where user_id = $1`,
      [req.user.id, plan.id]
    );

    await query(
      `insert into payments (user_id, plan_id, amount, currency, status, method, description)
       values ($1, $2, $3, $4, $5, 'offline', $6)`,
      [
        req.user.id,
        plan.id,
        Number(plan.price),
        plan.currency,
        Number(plan.price) > 0 ? "pending" : "paid",
        Number(plan.price) > 0
          ? `Plan change to ${plan.name} — invoice to be settled with the SBD team.`
          : `Moved to the free ${plan.name} plan.`,
      ]
    );

    const payments = await query(
      "select id, plan_id, amount, currency, status, method, description, created_at from payments where user_id = $1 order by created_at desc limit 50",
      [req.user.id]
    );

    res.json({
      ...(await subscriptionSummary(req.user.id)),
      payments: payments.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        amount: Number(row.amount),
        currency: row.currency,
        status: row.status,
        method: row.method,
        description: row.description,
        createdAt: row.created_at,
      })),
      message:
        Number(plan.price) > 0
          ? `You are on the ${plan.name} plan. An invoice for ${plan.currency} ${Number(plan.price).toFixed(2)} was added to your payment history.`
          : `You are on the ${plan.name} plan.`,
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
      message: `Your ${summary.plan?.name || "current"} plan is cancelled. It stays available until ${new Date(
        summary.currentPeriodEnd
      ).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
