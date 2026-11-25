import { query, one } from "./db.js";

/* Every account sits on a plan. The row is created on first use so older
   accounts keep working without a migration step of their own. */
export const DEFAULT_PLAN = "starter";

/* Token usage tracking. Each plan has a monthly token allowance; when the
   customer runs out the account is suspended until the period renews or they
   upgrade. The real per-token price is never shown to customers. */
export async function addTokenUsage(userId, tokens) {
  await query(
    `update subscriptions
       set tokens_used = greatest(0, tokens_used + $2), updated_at = now()
     where user_id = $1`,
    [userId, tokens]
  );
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
  const plan = await one("select * from plans where id = $1", [subscription.plan_id]);
  const fallback = await one("select * from plans where id = $1", [DEFAULT_PLAN]);
  return { subscription, plan: plan || fallback };
}

export async function usageFor(userId) {
  const row = await one(
    `select
       (select count(*)::int from assistants where user_id = $1) as assistants,
       (select count(*)::int from conversations where user_id = $1 and created_at >= date_trunc('month', now())) as conversations,
       (select count(*)::int
          from messages m
          join conversations c on c.id = m.conversation_id
         where c.user_id = $1 and m.role = 'user' and m.created_at >= date_trunc('month', now())) as messages,
       (select count(*)::int from leads where user_id = $1) as leads`,
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
      assistantLimit: plan?.assistant_limit ?? 1,
      messageLimit: plan?.message_limit ?? 200,
      tokensUsed: subscription.tokens_used ?? 0,
      tokenLimit: plan?.token_limit ?? 0,
    },
  };
}

/* Used before accepting a visitor message. Returns an error string when the
   plan's monthly allowance is used up, otherwise an empty string. */
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
