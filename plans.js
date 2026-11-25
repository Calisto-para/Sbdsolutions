import { query, one } from "./db.js";
import { AiNotConfiguredError } from "./ai.js";

/* Every account sits on a plan. The row is created on first use so older
   accounts keep working without a migration step of their own. */
export const DEFAULT_PLAN = "starter";

/* Token usage tracking. Each plan has a monthly token allowance; when the
   customer runs out the account is suspended until the period renews or they
   upgrade. The real per-token price is never shown to customers.

   This file also tracks the new SBD AI credit allowance and the internal
   OpenAI dollar spending cap. The credit allowance is what customers see
   ($1 actual OpenAI cost = 1,000 SBD AI credits). The dollar spending cap
   is internal and separate, so a single account can be stopped by either
   limit independently. */
export async function addTokenUsage(userId, tokens) {
  await query(
    `update subscriptions
       set tokens_used = greatest(0, tokens_used + $2), updated_at = now()
     where user_id = $1`,
    [userId, tokens]
  );
}

/* SBD AI credits. The monthly credit allowance is per plan and is what
   customers see in the dashboard. $1 of actual OpenAI API cost is converted
   to 1,000 SBD AI credits, so fractional usage is accumulated accurately and
   individual API requests are never rounded upward. */
export async function creditsUsed(userId) {
  const sub = await one("select * from subscriptions where user_id = $1", [userId]);
  return sub ? Number(sub.credits_used || 0) : 0;
}

export async function recordCreditUsage(userId, deltaCredits) {
  await query(
    `update subscriptions
       set credits_used = greatest(0, (coalesce(credits_used, 0) + $2)),
           updated_at = now()
     where user_id = $1`,
    [userId, deltaCredits]
  );
}

export async function resetCreditUsage(userId) {
  await query(
    `update subscriptions set credits_used = 0, updated_at = now() where user_id = $1`,
    [userId]
  );
}

export async function checkCreditLimit(userId) {
  const { plan } = await currentPlan(userId);
  const sub = await one("select * from subscriptions where user_id = $1", [userId]);
  if (!plan || !sub) return "";
  if (!plan.credit_limit || plan.credit_limit <= 0) return ""; /* enterprise: no limit */
  if ((sub.credits_used || 0) >= plan.credit_limit) {
    return `Your ${plan.credit_limit.toLocaleString("en-GB")}-credit SBD AI allowance on the ${plan.name} plan is used up for this month. Renew or upgrade to keep using AI features.`;
  }
  return "";
}

/* Internal OpenAI dollar spending cap. This is separate from the customer-
   facing credit allowance. It is enforced against the plan's underlying cost
   so the business never spends more on OpenAI than the plan's internal
   monthly figure for that customer. */
export async function spendingUsed(userId) {
  const sub = await one("select * from subscriptions where user_id = $1", [userId]);
  return sub ? Number(sub.spending_used || 0) : 0;
}

export async function recordSpending(userId, deltaDollars) {
  await query(
    `update subscriptions
       set spending_used = greatest(0, (coalesce(spending_used, 0) + $2)),
           updated_at = now()
     where user_id = $1`,
    [userId, deltaDollars]
  );
}

export async function resetSpendingUsage(userId) {
  await query(
    `update subscriptions set spending_used = 0, updated_at = now() where user_id = $1`,
    [userId]
  );
}

export function spendingLimitFor(plan) {
  if (!plan) return null;
  if (plan.custom) return null; /* enterprise: agreed cap */
  return Number(plan.underlying_cost || 0);
}

export async function checkSpendingLimit(userId) {
  const { plan } = await currentPlan(userId);
  const sub = await one("select * from subscriptions where user_id = $1", [userId]);
  if (!plan || !sub) return "";
  const cap = spendingLimitFor(plan);
  if (!cap || cap <= 0) return ""; /* enterprise: no cap */
  if ((sub.spending_used || 0) >= cap) {
    return `This month's OpenAI spending on your ${plan.name} plan has reached the internal monthly limit. Renew or upgrade to keep using AI features.`;
  }
  return "";
}

/* Convert a real OpenAI usage object into actual dollars for the configured
   model, using the prices from environment. Missing usage fields are treated
   as zero. Cached prompt tokens are billed at the cheaper cached-input rate
   for the non-cached portion only. */
export function costInDollars(usage, prices) {
  if (!usage || !prices) return 0;
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const cachedTokens = Number(usage.cached_tokens || 0);
  const freshPromptTokens = Math.max(0, promptTokens - cachedTokens);
  const inputCost =
    (freshPromptTokens / 1_000_000) * prices.inputPricePerM +
    (cachedTokens / 1_000_000) * prices.cachedInputPricePerM;
  const outputCost = (completionTokens / 1_000_000) * prices.outputPricePerM;
  return inputCost + outputCost;
}

/* Convert actual dollars to SBD AI credits at $1 = 1,000 credits. The result
   stays fractional so usage is accumulated accurately. */
export function creditsFor(dollars) {
  return dollars * 1000;
}

/* Shared helper: check whether the account behind an AI request is even
   allowed to call OpenAI. Used by both dashboard and widget routes so the
   checks stay in one place. */
export async function requireActiveAiAccount(userId) {
  const { plan } = await currentPlan(userId);
  if (!plan) {
    throw new Error("No plan found for this account.");
  }
  if (plan.custom) {
    /* Enterprise customers are billed by agreement and are not self-serve.
       The dashboard and widget routes should reject these before calling
       OpenAI. */
    throw new AiNotConfiguredError();
  }
}

export async function resetTokenUsage(userId) {
  await query(
    `update subscriptions set tokens_used = 0, updated_at = now() where user_id = $1`,
    [userId]
  );
}

export async function checkTokenLimit(userId) {
  const { plan } = await currentPlan(userId);
  const sub = await one("select * from subscriptions where user_id = $1", [userId]);
  if (!plan || !sub) return "";
  if (plan.token_limit <= 0) return ""; /* enterprise: no token limit */
  if (sub.tokens_used >= plan.token_limit) {
    return `Your ${plan.token_limit.toLocaleString("en-GB")}-token monthly allowance on the ${plan.name} plan is used up. Renew or upgrade to keep using AI features.`;
  }
  return "";
}

export async function suspendForTokenExhaustion(userId, planName) {
  await query(
    `update users
       set suspended_at = now(),
           suspended_reason = $2,
           updated_at = now()
     where id = $1`,
    [userId, `Token allowance (${planName} plan, ${plan.tokenLimit?.toLocaleString('en-GB') ?? 'N/A'} tokens) exhausted — renew or upgrade to continue.`]
  );
}

export async function currentPlan(userId) {
  const row = await one(
    `insert into subscriptions (user_id, plan_id)
     values ($1, $2)
     on conflict (user_id) do nothing
     returning *`,
    [userId, DEFAULT_PLAN]
  );
  const subscription =
    row || (await one("select * from subscriptions where user_id = $1", [userId]));
  if (subscription && new Date(subscription.current_period_end) <= new Date()) {
    await query(
      `update subscriptions
          set period_start_at = now(),
              current_period_end = now() + interval '30 days',
              tokens_used = 0,
              credits_used = 0,
              spending_used = 0,
              updated_at = now()
        where user_id = $1`,
      [userId]
    );
  }
  const normalized =
    subscription && new Date(subscription.current_period_end) <= new Date()
      ? await one("select * from subscriptions where user_id = $1", [userId])
      : subscription;
  const currentSubscription = normalized || subscription;
  const plan = await one("select * from plans where id = $1", [subscription.plan_id]);
  const fallback = await one("select * from plans where id = $1", [DEFAULT_PLAN]);
  return { subscription: currentSubscription, plan: plan || fallback };
}

export async function usageFor(userId) {
  const row = await one(
    `select
       (select count(*)::int from assistants where user_id = $1) as assistants,
       (select count(*)::int from conversations c
          join subscriptions s on s.user_id = c.user_id
         where c.user_id = $1 and c.created_at >= s.period_start_at) as conversations,
       (select count(*)::int
          from messages m
          join conversations c on c.id = m.conversation_id
          join subscriptions s on s.user_id = c.user_id
         where c.user_id = $1 and m.role = 'user' and m.created_at >= s.period_start_at) as messages,
       (select count(*)::int from leads l
          join subscriptions s on s.user_id = l.user_id
         where l.user_id = $1 and l.created_at >= s.period_start_at) as leads,
       (select count(*)::int
          from (select distinct c.visitor_id
                  from conversations c
                  join subscriptions s on s.user_id = c.user_id
                 where c.user_id = $1
                   and c.channel = 'widget'
                   and c.visitor_id <> ''
                   and c.created_at >= s.period_start_at) unique_visitors) as unique_customers`,
    [userId]
  );
  return row;
}

const shape = (plan) =>
  plan
    ? {
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        currency: plan.currency,
        assistantLimit: plan.assistant_limit,
        messageLimit: plan.message_limit,
        tokenLimit: plan.token_limit ?? 0,
        creditLimit: plan.custom ? null : Number(plan.credit_limit || 0),
        features: Array.isArray(plan.features) ? plan.features : [],
        custom: Boolean(plan.custom),
        billingNote: plan.billing_note || "",
        tokenPriceHidden: Boolean(plan.token_price_hidden),
        underlyingCost: plan.underlying_cost ? Number(plan.underlying_cost) : null,
      }
    : null;

export async function subscriptionSummary(userId) {
  const { subscription, plan } = await currentPlan(userId);
  const usage = await usageFor(userId);
  const active =
    subscription.status === "active" ||
    (subscription.status === "canceled" && new Date(subscription.current_period_end) > new Date());
  return {
    planId: subscription.plan_id,
    plan: shape(plan),
    status: subscription.status,
    active,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    startedAt: subscription.started_at,
    currentPeriodEnd: subscription.current_period_end,
    usage: {
      assistants: usage.assistants,
      conversations: usage.conversations,
      messages: usage.messages,
      leads: usage.leads,
      uniqueCustomers: usage.unique_customers,
      assistantLimit: plan?.assistant_limit ?? 1,
      messageLimit: plan?.message_limit ?? 200,
      tokensUsed: subscription.tokens_used ?? 0,
      tokenLimit: plan?.token_limit ?? 0,
      creditsUsed: subscription.credits_used ?? 0,
      creditLimit: plan?.credit_limit && !plan?.custom ? Number(plan.credit_limit) : null,
      spendingUsed: subscription.spending_used ?? 0,
      spendingLimit: (!plan?.custom && Number(plan.underlying_cost || 0)) || null,
    },
  };
}

/* Used before accepting a visitor message. Returns an error string when the
   plan's monthly allowance is used up, otherwise an empty string.

   Visitor messages are counted for the business owner's plan (the owner of
   the widget/assistant being chatting with), so a busy widget is charged to
   the business's monthly visitor-message allowance, not to the visitor. */
export async function messageAllowanceError(userId) {
  const { plan } = await currentPlan(userId);
  const usage = await usageFor(userId);
  if (usage.messages < (plan?.message_limit ?? 200)) return "";
  return `This month's ${plan?.message_limit ?? 200}-message allowance on the ${plan?.name || "Starter"} plan is used up. Upgrade the plan to keep answering visitors.`;
}

export async function assistantAllowanceError(userId) {
  const { plan } = await currentPlan(userId);
  const usage = await usageFor(userId);
  if (usage.assistants < (plan?.assistant_limit ?? 1)) return "";
  return `The ${plan?.name || "Starter"} plan includes ${plan?.assistant_limit ?? 1} AI assistant${(plan?.assistant_limit ?? 1) === 1 ? "" : "s"}. Upgrade the plan to add another.`;
}
