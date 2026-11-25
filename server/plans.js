import { one } from "./db.js";

/* Every account sits on a plan. The row is created on first use so older
   accounts keep working without a migration step of their own. */
export const DEFAULT_PLAN = "starter";

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
        features: Array.isArray(plan.features) ? plan.features : [],
      }
    : null;

export async function subscriptionSummary(userId) {
  const { subscription, plan } = await currentPlan(userId);
  const usage = await usageFor(userId);
  return {
    planId: subscription.plan_id,
    plan: shape(plan),
    status: subscription.status,
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
