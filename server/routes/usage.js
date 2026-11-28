import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";
import { unreadCount } from "../notify.js";
import { syncUsageWarnings, usageOverview } from "../usage.js";
import { upgradeQuote } from "./subscriptions.js";

/* Usage monitoring API. Everything is read from the customer's real account;
   nothing here is demo data. */
const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const overview = await usageOverview(req.user.id);

    /* The warning rows are written in the background: a dashboard load must not
       wait for an email provider, and the computed warnings are already in
       this response. */
    syncUsageWarnings(req.user.id, overview).catch((error) =>
      console.error(`[usage] warning sync failed for ${req.user.id}: ${error.message}`)
    );

    const packages = await query(
      `select id, name, credits, price, currency from credit_packages
        where active = true order by sort_order asc, credits asc`
    );
    const purchases = await query(
      `select credits, price, currency, created_at from credit_purchases
        where user_id = $1 order by created_at desc limit 20`,
      [req.user.id]
    );

    res.json({
      ...overview,
      creditPackages: packages.map((row) => ({
        id: row.id,
        name: row.name,
        credits: Number(row.credits),
        price: Number(row.price),
        currency: row.currency || "USD",
      })),
      creditPurchases: purchases.map((row) => ({
        credits: Number(row.credits),
        price: Number(row.price),
        currency: row.currency,
        createdAt: row.created_at,
      })),
      unreadNotifications: await unreadCount(req.user.id),
      paymentEnabled: Boolean(process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY),
    });
  } catch (error) {
    next(error);
  }
});

/* Upgrade prices for every standard plan, so the dashboard can show the real
   prorated charge before the customer commits. */
router.get("/upgrades", async (req, res, next) => {
  try {
    const overview = await usageOverview(req.user.id);
    const plans = await query("select * from plans where custom = false order by sort_order asc");
    const current = plans.find((plan) => plan.id === overview.plan?.id);
    const options = plans
      .filter((plan) => Number(plan.price) > Number(current?.price || 0))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        creditLimit: Number(plan.credit_limit || 0),
        customerLimit: plan.message_limit,
        assistantLimit: plan.assistant_limit,
        quote: upgradeQuote({
          currentPlan: current,
          newPlan: plan,
          periodEnd: overview.renewalDate,
        }),
      }));
    res.json({
      current: overview.plan,
      options,
      policy:
        "Upgrading charges only the difference for the days left in your current billing period. Your renewal date does not change, and used or purchased credits are kept.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
