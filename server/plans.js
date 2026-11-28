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

/* The effective monthly allowance is the plan's credits plus any extra credits
   the customer bought. Purchased credits are tracked separately
   (subscriptions.bonus_credits), never folded into the plan figure, and a
   renewal resets only the plan part. */
export function totalCreditAllowance(plan, subscription) {
  if (!plan) return null;
  const bonus = Math.max(0, Number(subscription?.bonus_credits || 0));
  /* Only a plan explicitly marked unlimited may skip the credit gate. A
     custom plan without a stated allowance gets zero credits, never an
     implicit unlimited balance. */
  if (plan.unlimited_credits) return null;
  if (plan.custom) return Math.max(0, Number(plan.credit_limit || 0)) + bonus;
  if (!plan.credit_limit || plan.credit_limit <= 0) return null;
  return Number(plan.credit_limit) + bonus;
}

export async function checkCreditLimit(userId) {
  const { subscription, plan } = await currentPlan(userId);
  if (!plan || !subscription) return "";
  const allowance = totalCreditAllowance(plan, subscription);
  if (allowance == null) return ""; /* enterprise: no limit */
  if (Number(subscription.credits_used || 0) >= allowance) {
    return `You have reached your monthly AI credit limit (${allowance.toLocaleString("en-GB")} credits on the ${plan.name} plan). Upgrade your subscription or purchase additional credits to continue.`;
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

/* Read the token counts out of an OpenAI `usage` object. OpenAI reports
   cached prompt tokens under `prompt_tokens_details.cached_tokens` (older
   shapes put them at the top level), cache writes under
   `prompt_tokens_details.cache_write_tokens`, and reasoning tokens inside
   `completion_tokens_details.reasoning_tokens` — reasoning tokens are already
   part of `completion_tokens`, so they are reported but never added twice. */
export function normalizedUsage(usage = {}) {
  const promptDetails = usage.prompt_tokens_details || {};
  const completionDetails = usage.completion_tokens_details || {};
  const count = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const promptTokens = count(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = count(usage.completion_tokens ?? usage.output_tokens);
  const cachedTokens = Math.min(promptTokens, count(promptDetails.cached_tokens ?? usage.cached_tokens));
  const cacheWriteTokens = Math.min(
    Math.max(0, promptTokens - cachedTokens),
    count(promptDetails.cache_write_tokens ?? usage.cache_write_tokens)
  );
  const reasoningTokens = Math.min(
    completionTokens,
    count(completionDetails.reasoning_tokens ?? usage.reasoning_tokens)
  );
  return { promptTokens, completionTokens, cachedTokens, cacheWriteTokens, reasoningTokens };
}

/* Convert a real OpenAI usage object into the actual dollars it cost, using
   the verified prices for the model that answered the request. Every token
   category is priced separately: fresh input, cached input, cache writes and
   output. A long-context tier, when the model publishes one, applies to the
   whole request once its prompt passes the threshold. */
export function costInDollars(usage, prices) {
  if (!usage || !prices) return 0;
  const { promptTokens, completionTokens, cachedTokens, cacheWriteTokens } = normalizedUsage(usage);
  if (promptTokens + completionTokens <= 0) return 0;

  const long = prices.longContext;
  const tier = long && promptTokens > Number(long.threshold || 272000) ? long : null;
  const inputRate = Number(tier ? tier.input : prices.inputPricePerM);
  const cachedRate = Number(tier ? tier.cachedInput : prices.cachedInputPricePerM);
  const outputRate = Number(tier ? tier.output : prices.outputPricePerM);
  const writeRate = Number(
    (tier && tier.cacheWrite != null ? tier.cacheWrite : prices.cacheWritePricePerM) ?? 0
  );
  if (![inputRate, cachedRate, outputRate].every(Number.isFinite)) return 0;

  const freshPromptTokens = Math.max(0, promptTokens - cachedTokens - cacheWriteTokens);
  const inputCost = (freshPromptTokens / 1_000_000) * inputRate;
  const cachedCost = (cachedTokens / 1_000_000) * cachedRate;
  const writeCost = (cacheWriteTokens / 1_000_000) * (Number.isFinite(writeRate) ? writeRate : 0);
  const outputCost = (completionTokens / 1_000_000) * outputRate;
  return inputCost + cachedCost + writeCost + outputCost;
}

/* Add one completed request's real cost to the account in a single UPDATE, so
   concurrent requests cannot lose an increment or push a balance past its
   limit. `least()` clamps at the plan allowance/cap: a customer can reach
   exactly their limit, never exceed it, and can never go negative. */
export async function chargeAiUsage(userId, dollars) {
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const credits = creditsFor(dollars);
  return one(
    `update subscriptions s
        set credits_used = least(
              coalesce(p.credit_limit, 1e18) + greatest(0, coalesce(s.bonus_credits, 0)),
              coalesce(s.credits_used, 0) + $2::numeric
            ),
            spending_used = least(coalesce(p.underlying_cost, 1e18), coalesce(s.spending_used, 0) + $3::numeric),
            updated_at = now()
       from plans p
      where s.user_id = $1 and p.id = s.plan_id
      returning s.credits_used, s.spending_used, s.bonus_credits,
                p.credit_limit, p.underlying_cost, p.custom`,
    [userId, credits, dollars]
  );
}

/* Thrown when the account has used its monthly SBD AI credits or reached its
   internal API spending cap. 402 is deliberate: it asks the customer to
   renew or upgrade, and it does not sign them out of the dashboard. */
export class AiAllowanceError extends Error {
  constructor(message, code = "CREDITS_EXHAUSTED") {
    super(message);
    this.status = 402;
    this.code = code;
  }
}

/* Pre-flight gate for every billable AI call. It runs before OpenAI is asked
   anything, so an exhausted account stops making chargeable requests instead
   of being served one more answer it cannot pay for. */
export async function aiAllowanceError(userId) {
  const creditError = await checkCreditLimit(userId);
  if (creditError) return { message: creditError, code: "CREDITS_EXHAUSTED" };
  const spendError = await checkSpendingLimit(userId);
  if (spendError) return { message: spendError, code: "SPENDING_LIMIT" };
  return null;
}

/* The published credit rate: $0.01 of actual OpenAI API cost = 10 SBD AI
   credits, i.e. $1 = 1,000 credits. The result stays fractional so usage is
   accumulated accurately and a request is never rounded up. */
export const CREDITS_PER_DOLLAR = 1000;
export const CREDITS_PER_CENT = CREDITS_PER_DOLLAR / 100;

export function creditsFor(dollars) {
  return dollars * CREDITS_PER_DOLLAR;
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

  const blocked = await aiAllowanceError(userId);
  if (blocked) throw new AiAllowanceError(blocked.message, blocked.code);
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
  const storedPlan = await one("select * from plans where id = $1", [subscription.plan_id]);
  const fallback = await one("select * from plans where id = $1", [DEFAULT_PLAN]);

  /* A custom plan is only in force while the subscription is active and its
     paid period has not ended. Once it expires or is cancelled, every caller
     of currentPlan() sees the standard fallback plan, so no allowance can leak
     past the paid period. The stored custom plan is kept for history. */
  const customActive = Boolean(
    storedPlan?.custom &&
      storedPlan.custom_request_id &&
      (subscription.status === "active" || subscription.status === "canceled") &&
      new Date(subscription.current_period_end) > new Date()
  );
  const plan = storedPlan?.custom && storedPlan.custom_request_id && !customActive
    ? fallback
    : storedPlan || fallback;
  return { subscription, plan, storedPlan, customActive };
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
       /* Monthly customer allowance counts each person once, however many
          conversations or messages they send. A person is identified by the
          stable visitor id the widget keeps in the browser, then by a known
          email or phone, and only an anonymous legacy chat falls back to the
          conversation itself. */
       (select count(distinct coalesce(
                 nullif(c.visitor_key, ''),
                 nullif(c.visitor_email, ''),
                 nullif(c.visitor_phone, ''),
                 c.id::text
               ))::int
          from conversations c
          join messages m on m.conversation_id = c.id
         where c.user_id = $1
           and m.role = 'user'
           and m.created_at >= date_trunc('month', now())) as customers,
       (select count(*)::int from leads where user_id = $1) as leads`,
    [userId]
  );
  return row;
}

/* Effective AI agent allowance. Standard plans use the plan's own limit;
   Enterprise must be given an explicit allowance by an operator. */
export function assistantLimitFor(plan, subscription) {
  if (!plan) return 0;
  if (plan.custom) {
    /* A custom plan carries its own allowance; Enterprise (no plan limit) uses
       the allowance an operator assigned to the account. */
    const own = Math.max(0, Number(plan.assistant_limit || 0));
    if (own > 0) return own;
    const assigned = subscription?.agent_allowance;
    return assigned == null ? 0 : Math.max(0, Number(assigned));
  }
  return Math.max(0, Number(plan.assistant_limit || 0));
}

export async function agentUsage(userId) {
  const { subscription, plan } = await currentPlan(userId);
  const counted = await one("select count(*)::int as used from assistants where user_id = $1", [userId]);
  const used = Number(counted?.used || 0);
  const limit = assistantLimitFor(plan, subscription);
  const custom = Boolean(plan?.custom);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    canCreate: used < limit,
    planId: plan?.id || "",
    planName: plan?.name || "Starter",
    custom,
    /* Enterprise with no allowance configured yet. */
    allowancePending: custom && subscription?.agent_allowance == null,
  };
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
        creditLimit: plan.unlimited_credits ? null : Number(plan.credit_limit || 0),
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
    planId: plan?.id || subscription.plan_id,
    storedPlanId: subscription.plan_id,
    customActive: Boolean(plan?.custom && plan.custom_request_id),
    customExpiresAt: plan?.custom ? subscription.current_period_end : null,
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
      customers: usage.customers,
      leads: usage.leads,
      assistantLimit: assistantLimitFor(plan, subscription),
      agentAllowance: subscription.agent_allowance ?? null,
      agentRemaining: Math.max(0, assistantLimitFor(plan, subscription) - usage.assistants),
      canCreateAgent: usage.assistants < assistantLimitFor(plan, subscription),
      planCustom: Boolean(plan?.custom && plan.custom_request_id),
      customerLimit: plan?.message_limit ?? 50,
      messageLimit: plan?.message_limit ?? 50,
      tokensUsed: subscription.tokens_used ?? 0,
      tokenLimit: plan?.token_limit ?? 0,
      creditsUsed: subscription.credits_used ?? 0,
      /* extra credits bought on top of the plan, kept separate on purpose */
      bonusCredits: Number(subscription.bonus_credits || 0),
      planCredits: plan?.credit_limit != null && !plan?.unlimited_credits ? Number(plan.credit_limit) : null,
      creditLimit: totalCreditAllowance(plan, subscription),
      creditsRemaining: (() => {
        const allowance = totalCreditAllowance(plan, subscription);
        if (allowance == null) return null;
        return Math.max(0, allowance - Number(subscription.credits_used || 0));
      })(),
      spendingUsed: subscription.spending_used ?? 0,
      spendingLimit: (!plan?.custom && Number(plan.underlying_cost || 0)) || null,
      customRequestId: plan?.custom_request_id || null,
    },
  };
}

/* Used before accepting a visitor message. Returns an error string when the
   plan's monthly allowance is used up, otherwise an empty string.

   Visitor messages are counted for the business owner's plan (the owner of
   the widget/assistant being chatting with), so a busy widget is charged to
   the business's monthly visitor-message allowance, not to the visitor. */
/* The monthly allowance counts unique customers, not messages. */
export async function messageAllowanceError(userId, visitorKey = "") {
  const { plan } = await currentPlan(userId);
  const usage = await usageFor(userId);
  const limit = plan?.message_limit ?? 50;
  if (usage.customers < limit) return "";

  /* The allowance is spent, but a customer who is already counted this month
     must still be able to continue their conversation. */
  if (visitorKey) {
    const known = await one(
      `select 1
         from conversations c
         join messages m on m.conversation_id = c.id
        where c.user_id = $1
          and (c.visitor_key = $2 or c.visitor_email = $2 or c.visitor_phone = $2)
          and m.role = 'user'
          and m.created_at >= date_trunc('month', now())
        limit 1`,
      [userId, visitorKey]
    );
    if (known) return "";
  }

  return `This month's ${limit}-customer allowance on the ${plan?.name || "Starter"} plan is used up. Upgrade the plan to keep answering new customers.`;
}

export async function assistantAllowanceError(userId) {
  const usage = await agentUsage(userId);
  if (usage.canCreate) return "";
  if (usage.custom && usage.allowancePending) {
    return "Your Enterprise account does not have an AI agent allowance yet. Contact support so we can assign one to your account.";
  }
  return `You have reached the maximum number of AI agents allowed on your current plan (${usage.used} of ${usage.limit}). Upgrade your subscription to create additional AI agents.`;
}
