import { one } from "./db.js";
import { currentPlan, totalCreditAllowance, usageFor } from "./plans.js";
import { createNotification } from "./notify.js";
import { env } from "./env.js";

/* Subscription usage monitoring.
 *
 * Two independent allowances are tracked:
 *   - monthly SBD AI credits (plan allowance + purchased credits)
 *   - unique customers this month (the plan's customer limit)
 *
 * Warnings are generated from the actual percentages, stored once per billing
 * period and threshold, and never repeat for the same period.
 */

export const THRESHOLDS = [70, 85, 95, 100];

const percentOf = (used, limit) => {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((Number(used || 0) / limit) * 100));
};

/* The exact copy the product agreed for each threshold and allowance. */
export function warningText(kind, threshold) {
  const credits = kind === "credits";
  const table = {
    70: credits
      ? "Your AI credit usage has reached 70%. Consider monitoring your remaining allowance."
      : "Your unique-customer usage has reached 70%. Consider monitoring your remaining allowance.",
    85: credits
      ? "Your AI credits are almost exhausted. Consider upgrading your subscription to avoid interruption."
      : "Your unique-customer allowance is almost exhausted. Consider upgrading your subscription to avoid interruption.",
    95: credits
      ? "Your AI credits are nearly finished. Upgrade your plan or purchase additional credits to continue."
      : "Your unique-customer allowance is nearly finished. Upgrade your plan to keep serving new customers.",
    100: credits
      ? "You have reached your monthly AI credit limit. Upgrade your subscription or purchase additional credits to continue."
      : "You have reached your monthly unique-customer limit. Upgrade your subscription to keep serving new customers.",
  };
  return table[threshold] || "";
}

export function warningMeta(kind, threshold) {
  return {
    kind,
    threshold,
    level: threshold >= 95 ? "critical" : threshold >= 85 ? "warning" : "notice",
    title:
      threshold === 100
        ? kind === "credits"
          ? "AI credit limit reached"
          : "Unique-customer limit reached"
        : kind === "credits"
          ? `AI credits at ${threshold}%`
          : `Unique customers at ${threshold}%`,
    body: warningText(kind, threshold),
  };
}

/* Highest threshold crossed for a percentage (0 when still comfortable). */
export function reachedThreshold(percent) {
  let reached = 0;
  for (const threshold of THRESHOLDS) if (percent >= threshold) reached = threshold;
  return reached;
}

const periodKey = (date) => new Date(date || Date.now()).toISOString().slice(0, 10);

export async function usageOverview(userId) {
  const { subscription, plan } = await currentPlan(userId);
  const counts = await usageFor(userId);
  const creditAllowance = totalCreditAllowance(plan, subscription);
  const creditsUsed = Number(subscription.credits_used || 0);
  const customerLimit = Number(plan?.message_limit ?? 50);
  const customersUsed = Number(counts.customers || 0);

  const creditsPercent = creditAllowance == null ? 0 : percentOf(creditsUsed, creditAllowance);
  const customersPercent = percentOf(customersUsed, customerLimit);

  const credits = {
    used: creditsUsed,
    allowance: creditAllowance,
    planAllowance: plan?.credit_limit != null && !plan?.unlimited_credits ? Number(plan.credit_limit) : null,
    purchased: Math.max(0, Number(subscription.bonus_credits || 0)),
    remaining: creditAllowance == null ? null : Math.max(0, creditAllowance - creditsUsed),
    percent: creditsPercent,
    unlimited: creditAllowance == null,
    exhausted: creditAllowance != null && creditsUsed >= creditAllowance,
  };

  const customers = {
    used: customersUsed,
    limit: customerLimit,
    remaining: Math.max(0, customerLimit - customersUsed),
    percent: customersPercent,
    exhausted: customersUsed >= customerLimit,
  };

  return {
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          price: Number(plan.price),
          currency: plan.currency || "USD",
          custom: Boolean(plan.custom && plan.custom_request_id),
          customExpiresAt: plan.custom_request_id ? subscription.current_period_end : null,
          assistantLimit: assistantLimitForSafe(plan, subscription),
          billingNote: plan.billing_note || "",
          assistantLimit: assistantLimitForSafe(plan, subscription),
        }
      : null,
    status: subscription.status,
    active:
      subscription.status === "active" ||
      (subscription.status === "canceled" &&
        new Date(subscription.current_period_end) > new Date()),
    periodStart: subscription.period_start_at || subscription.started_at,
    renewalDate: subscription.current_period_end,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    credits,
    customers,
    agents: {
      used: Number(counts.assistants || 0),
      limit: assistantLimitForSafe(plan, subscription),
    },
    conversations: Number(counts.conversations || 0),
    leads: Number(counts.leads || 0),
    warnings: [
      ...(creditsPercent >= 70 ? [warningMeta("credits", reachedThreshold(creditsPercent))] : []),
      ...(customersPercent >= 70
        ? [warningMeta("customers", reachedThreshold(customersPercent))]
        : []),
    ].filter((warning) => warning.threshold >= 70),
  };
}

/* Local copy to avoid a circular import through plans.js at module load. */
function assistantLimitForSafe(plan, subscription) {
  if (!plan) return 0;
  if (plan.custom) {
    const own = Math.max(0, Number(plan.assistant_limit || 0));
    if (own > 0) return own;
    const assigned = subscription?.agent_allowance;
    return assigned == null ? 0 : Math.max(0, Number(assigned));
  }
  return Math.max(0, Number(plan.assistant_limit || 0));
}

/**
 * Create the in-app/email/push warning rows for any threshold this account has
 * crossed in the current billing period. Idempotent: the dedupe key contains
 * the period start, so each warning is announced once per period.
 */
export async function syncUsageWarnings(userId, overview = null) {
  const data = overview || (await usageOverview(userId));
  const period = periodKey(data.periodStart);
  const created = [];

  const jobs = [];
  if (!data.credits.unlimited && data.credits.percent >= 70) {
    jobs.push(["credits", data.credits.percent, data.credits.used, data.credits.allowance]);
  }
  if (data.customers.percent >= 70) {
    jobs.push(["customers", data.customers.percent, data.customers.used, data.customers.limit]);
  }

  for (const [kind, percent, used, limit] of jobs) {
    const threshold = reachedThreshold(percent);
    if (!threshold) continue;
    const meta = warningMeta(kind, threshold);
    const label = kind === "credits" ? "AI credits" : "unique customers";
    const result = await createNotification({
      userId,
      kind: "usage_warning",
      level: meta.level,
      title: meta.title,
      body: meta.body,
      link: `/dashboard?tab=usage&warning=${kind}-${threshold}`,
      dedupeKey: `usage:${kind}:${threshold}:${period}`,
      emailSubject: `${meta.title} — ${data.plan?.name || "your"} plan`,
      emailText: [
        meta.body,
        `${label}: ${Number(used).toLocaleString("en-GB")} of ${Number(limit).toLocaleString("en-GB")} used (${percent}%).`,
        data.renewalDate
          ? `Your current period renews on ${new Date(data.renewalDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}.`
          : "",
        kind === "credits" ? "You can upgrade your plan or purchase additional credits in the dashboard." : "",
      ]
        .filter(Boolean)
        .join("\n"),
      pushBody:
        kind === "credits"
          ? `You have used ${percent}% of your monthly AI credits.`
          : `You have used ${percent}% of your unique-customer allowance.`,
      tag: `sbd-usage-${kind}-${threshold}-${period}`,
    });
    if (result.inserted) created.push(meta);
  }

  return created;
}

/* Absolute dashboard URL for notification links (also used by email/push). */
export const dashboardLink = (path) => `${env.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
