import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAdmin, publicUser } from "../auth.js";
import { logAudit } from "../audit.js";
import { createNotification } from "../notify.js";
import { revenueReport, rangeFrom, notificationFeed, markNotificationsRead, integrationStatus } from "../reports.js";
import { mailDiagnostics } from "../mail-check.js";
import { sendTestEmail } from "../mail.js";
import { complete, aiStatus } from "../ai.js";
import { env } from "../env.js";
import { activatePayment, paymentView } from "../payments.js";
import { findService, startingPrice } from "../../shared/project-services.js";

/* Operator area. Every route is admin-only and answers 404 to anyone else, so
   the area is invisible to clients. */
const router = express.Router();
router.use(requireAdmin);

const searchTerm = (value) => `%${String(value || "").trim().replace(/[%_]/g, "")}%`;

/* Why the assistant is not answering. Operator-only: it reveals the model name
   and the provider's error status, never a key. */
router.post("/ai-test", async (req, res, next) => {
  try {
    const result = await complete({
      system: "Reply with the single word OK.",
      messages: [{ role: "user", content: "ping" }],
    });
    res.json({
      ok: true,
      model: env.openai.model,
      reply: String(result.text || "").slice(0, 40),
      lastFailure: aiStatus.lastFailure,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      model: env.openai.model,
      code: error?.code || "",
      status: Number(error?.status || 0) || null,
      message: String(error?.message || "The model did not answer.").slice(0, 300),
      lastFailure: aiStatus.lastFailure,
    });
  }
});

router.get("/", async (req, res, next) => {
  try {
    const totals = await one(
      `select
         (select count(*)::int from users) as users,
         (select count(*)::int from users where email_verified_at is not null) as verified_users,
         (select count(*)::int from users where created_at > now() - interval '7 days') as new_users,
         (select count(*)::int from users where role = 'admin') as admins,
         (select count(*)::int from assistants) as assistants,
         (select count(*)::int from conversations) as conversations,
         (select count(*)::int from messages) as messages,
         (select count(*)::int from knowledge_items) as knowledge_items,
         (select count(*)::int from users where suspended_at is not null) as suspended_users,
         (select count(*)::int from leads) as leads,
         (select count(*)::int from messages where created_at > now() - interval '7 days') as messages_week,
         (select count(*)::int from payments where status = 'pending') as pending_payments`
    );

    const recentUsers = await query(
      `select id, full_name, business_name, email, role, email_verified_at, created_at
         from users
        order by created_at desc
        limit 8`
    );

    const recentConversations = await query(
      `select c.id, c.title, c.updated_at,
              a.name as assistant_name,
              u.full_name, u.email,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
         join users u on u.id = c.user_id
        order by c.updated_at desc
        limit 8`
    );

    res.json({
      stats: {
        users: totals.users,
        verifiedUsers: totals.verified_users,
        newUsers: totals.new_users,
        admins: totals.admins,
        assistants: totals.assistants,
        conversations: totals.conversations,
        messages: totals.messages,
        knowledgeItems: totals.knowledge_items,
        suspendedUsers: totals.suspended_users,
        leads: totals.leads,
        messagesThisWeek: totals.messages_week,
        pendingPayments: totals.pending_payments,
      },
      recentUsers: recentUsers.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        businessName: row.business_name,
        email: row.email,
        role: row.role,
        emailVerified: Boolean(row.email_verified_at),
        createdAt: row.created_at,
      })),
      recentConversations: recentConversations.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        userName: row.full_name,
        userEmail: row.email,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select u.id, u.full_name, u.business_name, u.email, u.country, u.role,
              u.email_verified_at, u.created_at, u.suspended_at,
              (select count(*)::int from assistants a where a.user_id = u.id) as assistants,
              (select count(*)::int from conversations c where c.user_id = u.id) as conversations
         from users u
        where $1 = '%%'
           or u.full_name ilike $1
           or u.email ilike $1
           or u.business_name ilike $1
        order by u.created_at desc
        limit 50`,
      [q]
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        businessName: row.business_name,
        email: row.email,
        country: row.country,
        role: row.role,
        emailVerified: Boolean(row.email_verified_at),
        suspended: Boolean(row.suspended_at),
        assistants: row.assistants,
        conversations: row.conversations,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const user = await one("select * from users where id = $1", [id]);
    if (!user) return res.status(404).json({ error: "Not found." });

    const business = await one("select * from businesses where user_id = $1", [id]);
    const assistants = await query(
      `select a.id, a.name, a.is_active, a.created_at,
              (select count(*)::int from knowledge_items k where k.assistant_id = a.id) as knowledge_items,
              (select count(*)::int from conversations c where c.assistant_id = a.id) as conversations
         from assistants a
        where a.user_id = $1
        order by a.created_at desc`,
      [id]
    );
    const conversations = await query(
      `select c.id, c.title, c.updated_at, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
        order by c.updated_at desc
        limit 10`,
      [id]
    );

    const subscription = await one("select * from subscriptions where user_id = $1", [id]);

    const [payments, tickets, usage] = await Promise.all([
      query(
        `select id, amount, currency, status, kind, reference, created_at, verified_at
           from payments where user_id = $1 order by created_at desc limit 12`,
        [id]
      ),
      query(
        `select id, subject, status, priority, created_at from support_tickets
          where user_id = $1 order by created_at desc limit 8`,
        [id]
      ),
      one(
        `select
           (select count(*)::int from conversations where user_id = $1) as conversations,
           (select count(*)::int from leads where user_id = $1) as leads,
           (select count(*)::int from knowledge_items where user_id = $1) as knowledge_items`,
        [id]
      ),
    ]);

    const planRow = subscription?.plan_id
      ? await one("select * from plans where id = $1", [subscription.plan_id])
      : null;

    res.json({
      user: {
        ...publicUser(user),
        country: user.country,
        phone: user.phone,
        createdAt: user.created_at,
      },
      subscription: subscription
        ? {
            planId: subscription.plan_id,
            planName: planRow?.name || "",
            customPlan: Boolean(planRow?.custom && planRow?.custom_request_id),
            creditsAllowance: planRow ? (planRow.unlimited_credits ? null : Number(planRow.credit_limit || 0)) : null,
            customerLimit: planRow ? Number(planRow.message_limit || 0) : null,
            assistantLimit: planRow ? Number(planRow.assistant_limit || 0) : null,
            customActivatedAt: subscription.custom_activated_at || null,
            customPreviousPlanId: subscription.custom_previous_plan_id || null,
            status: subscription.status,
            agentAllowance: subscription.agent_allowance ?? null,
            startedAt: subscription.started_at,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
            creditsUsed: Number(subscription.credits_used || 0),
            bonusCredits: Number(subscription.bonus_credits || 0),
          }
        : null,
      payments: payments.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        currency: row.currency,
        status: row.status,
        kind: row.kind || "plan",
        reference: row.reference,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
      })),
      tickets: tickets.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        createdAt: row.created_at,
      })),
      usage: {
        conversations: Number(usage?.conversations || 0),
        leads: Number(usage?.leads || 0),
        knowledgeItems: Number(usage?.knowledge_items || 0),
      },
      business: business
        ? {
            name: business.name,
            industry: business.industry,
            website: business.website,
            supportEmail: business.support_email,
            phone: business.phone,
            address: business.address,
            description: business.description,
          }
        : null,
      assistants: assistants.map((row) => ({
        id: row.id,
        name: row.name,
        active: Boolean(row.is_active),
        knowledgeItems: row.knowledge_items,
        conversations: row.conversations,
        createdAt: row.created_at,
      })),
      conversations: conversations.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        role: z.enum(["client", "admin"]).optional(),
        suspended: z.boolean().optional(),
        suspendedReason: z.string().trim().max(300).optional(),
        /* Agent allowance assigned to Enterprise accounts (null clears it). */
        agentAllowance: z.number().int().min(0).max(10000).nullable().optional(),
      })
      .refine(
        (data) =>
          data.role !== undefined ||
          data.suspended !== undefined ||
          data.agentAllowance !== undefined,
        { message: "Choose a role, a suspension state or an agent allowance." }
      )
      .parse(req.body);

    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot change your own account." });
    }

    const updated = await one(
      `update users
          set role = coalesce($2, role),
              suspended_at = case when $3::boolean is null then suspended_at
                                  when $3 then now() else null end,
              suspended_reason = case when $3::boolean is null then suspended_reason
                                      when $3 then $4 else '' end,
              updated_at = now()
        where id = $1
        returning *`,
      [id, body.role ?? null, body.suspended ?? null, body.suspendedReason || ""]
    );
    if (!updated) return res.status(404).json({ error: "Not found." });

    if (body.agentAllowance !== undefined) {
      await query(
        `insert into subscriptions (user_id, plan_id, agent_allowance)
         values ($1, 'starter', $2)
         on conflict (user_id) do update
            set agent_allowance = $2, updated_at = now()`,
        [id, body.agentAllowance]
      );
    }

    await logAudit({
      actorId: req.user.id,
      action: body.suspended === undefined ? "account.update" : body.suspended ? "account.suspend" : "account.reactivate",
      target: id,
      meta: { role: body.role ?? null, suspended: body.suspended ?? null, agentAllowance: body.agentAllowance ?? null },
    });

    res.json({
      ok: true,
      user: publicUser(updated),
      agentAllowance: body.agentAllowance,
      message:
        body.agentAllowance !== undefined
          ? body.agentAllowance === null
            ? "Enterprise agent allowance cleared."
            : `${updated.full_name} can now create up to ${body.agentAllowance} AI agents.`
          : body.suspended === true
            ? `${updated.full_name} can no longer sign in.`
            : body.suspended === false
              ? `${updated.full_name} can sign in again.`
              : "Account updated.",
    });
  } catch (error) {
    next(error);
  }
});

/* Payment verification: an operator can confirm a bank transfer (or an online
   payment the provider has not confirmed yet) and that activates the plan. */
router.get("/payments", async (req, res, next) => {
  try {
    const status = ["pending", "paid", "rejected"].includes(String(req.query.status))
      ? String(req.query.status)
      : "";
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select p.*, u.full_name, u.email, pl.name as plan_name
         from payments p
         join users u on u.id = p.user_id
         left join plans pl on pl.id = p.plan_id
        where ($1 = '' or p.status = $1)
          and ($2 = '%%' or u.full_name ilike $2 or u.email ilike $2
               or p.reference ilike $2 or p.note ilike $2)
        order by p.created_at desc
        limit 100`,
      [status, q]
    );

    const totals = await one(
      `select
         (select count(*)::int from payments where status = 'pending') as pending,
         (select count(*)::int from payments where status = 'paid') as paid,
         (select count(*)::int from payments where status = 'rejected') as rejected`
    );

    res.json({
      payments: rows.map((row) => ({
        ...paymentView(row),
        planName: row.plan_name || row.plan_id,
        customerName: row.full_name,
        customerEmail: row.email,
      })),
      totals,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/:id/verify", async (req, res, next) => {
  try {
    const payment = await one("select * from payments where id = $1", [req.params.id]);
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (payment.status === "rejected") {
      return res.status(400).json({ error: "This payment was rejected. Ask the customer to choose the plan again." });
    }
    if (payment.status !== "pending") {
      return res.status(409).json({ error: `This payment is already ${payment.status}. Nothing was activated again.` });
    }

    await activatePayment(payment, { verifiedBy: req.user.id, method: payment.method || "transfer" });
    await logAudit({
      actorId: req.user.id,
      action: "payment.verify",
      target: payment.id,
      meta: { reference: payment.reference, amount: Number(payment.amount), currency: payment.currency },
    });
    const isCustom = (payment.kind || "plan") === "custom";
    res.json({
      ok: true,
      message: isCustom
        ? "Payment verified. The custom request is approved."
        : "Payment verified. The customer is now on the plan.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/:id/reject", async (req, res, next) => {
  try {
    const { reason } = z
      .object({ reason: z.string().trim().max(300).optional().default("") })
      .parse(req.body || {});

    const updated = await one(
      `update payments set status = 'rejected', rejected_reason = $2 where id = $1 returning *`,
      [req.params.id, reason || "Not received"]
    );
    if (!updated) return res.status(404).json({ error: "Payment not found." });

    await logAudit({
      actorId: req.user.id,
      action: "payment.reject",
      target: updated.id,
      meta: { reference: updated.reference, reason: reason || "Not received" },
    });
    res.json({ ok: true, message: "Payment rejected. The plan was not activated." });
  } catch (error) {
    next(error);
  }
});

/* Every business and assistant on the platform, for operator monitoring. */
router.get("/businesses", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select u.id as user_id, u.full_name, u.email, u.suspended_at, u.created_at,
              b.name, b.industry, b.website, b.phone,
              (select count(*)::int from assistants a where a.user_id = u.id) as assistants,
              (select count(*)::int from conversations c where c.user_id = u.id) as conversations,
              (select count(*)::int from leads l where l.user_id = u.id) as leads
         from users u
         left join businesses b on b.user_id = u.id
        where u.role = 'client'
          and ($1 = '%%' or u.full_name ilike $1 or u.email ilike $1 or b.name ilike $1)
        order by u.created_at desc
        limit 100`,
      [q]
    );

    res.json({
      businesses: rows.map((row) => ({
        userId: row.user_id,
        owner: row.full_name,
        email: row.email,
        name: row.name || "",
        industry: row.industry || "",
        website: row.website || "",
        phone: row.phone || "",
        suspended: Boolean(row.suspended_at),
        assistants: row.assistants,
        conversations: row.conversations,
        leads: row.leads,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/assistants", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select a.id, a.name, a.is_active, a.created_at, a.user_id,
              u.full_name, u.email,
              (select count(*)::int from conversations c where c.assistant_id = a.id) as conversations,
              (select count(*)::int from messages m join conversations c on c.id = m.conversation_id
                where c.assistant_id = a.id) as messages
         from assistants a
         join users u on u.id = a.user_id
        where $1 = '%%' or a.name ilike $1 or u.email ilike $1 or u.full_name ilike $1
        order by a.created_at desc
        limit 100`,
      [q]
    );

    res.json({
      assistants: rows.map((row) => ({
        id: row.id,
        name: row.name,
        active: Boolean(row.is_active),
        owner: row.full_name,
        email: row.email,
        conversations: row.conversations,
        messages: row.messages,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* Activity and usage across the platform. */
router.get("/platform", async (req, res, next) => {
  try {
    const activity = await one(
      `select
         (select count(*)::int from messages where created_at > now() - interval '7 days') as messages_week,
         (select count(*)::int from conversations where created_at > now() - interval '7 days') as conversations_week,
         (select count(*)::int from leads where created_at > now() - interval '7 days') as leads_week,
         (select count(*)::int from leads) as leads,
         (select count(*)::int from assistants where is_active) as active_assistants,
         (select count(*)::int from users where suspended_at is not null) as suspended_users`
    );

    const daily = await query(
      `select to_char(day, 'YYYY-MM-DD') as day,
              (select count(*)::int from messages m
                where m.created_at >= day and m.created_at < day + interval '1 day') as messages,
              (select count(*)::int from leads l
                where l.created_at >= day and l.created_at < day + interval '1 day') as leads
         from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') as day
        order by day asc`
    );

    const busiest = await query(
      `select u.id, u.full_name, u.email,
              (select count(*)::int from messages m join conversations c on c.id = m.conversation_id
                where c.user_id = u.id) as messages
         from users u
        where u.role = 'client'
        order by messages desc, u.created_at desc
        limit 5`
    );

    res.json({
      activity: {
        messagesThisWeek: activity.messages_week,
        conversationsThisWeek: activity.conversations_week,
        leadsThisWeek: activity.leads_week,
        leads: activity.leads,
        activeAssistants: activity.active_assistants,
        suspendedUsers: activity.suspended_users,
      },
      daily: daily.map((row) => ({ day: row.day, messages: row.messages, leads: row.leads })),
      busiest: busiest.map((row) => ({ id: row.id, name: row.full_name, email: row.email, messages: row.messages })),
    });
  } catch (error) {
    next(error);
  }
});

/* Is the configured sender actually accepted by the provider? */
router.get("/email", async (req, res, next) => {
  try {
    res.json(await mailDiagnostics());
  } catch (error) {
    next(error);
  }
});

router.post("/email-test", async (req, res, next) => {
  try {
    const result = await sendTestEmail(req.user.email);
    res.json({
      delivered: result.delivered,
      provider: result.provider || "",
      failures: result.failures || [],
      message: result.delivered
        ? `Test email sent to ${req.user.email} through ${result.provider}.`
        : "The email provider rejected the test message — see the provider response below.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select c.id, c.title, c.updated_at,
              a.name as assistant_name,
              u.full_name, u.email,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
         join users u on u.id = c.user_id
        where $1 = '%%'
           or c.title ilike $1
           or u.email ilike $1
           or u.full_name ilike $1
           or a.name ilike $1
        order by c.updated_at desc
        limit 50`,
      [q]
    );

    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        userName: row.full_name,
        userEmail: row.email,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- project enquiries and quotations ---------- */

const PROJECT_STATUSES = ["New", "Reviewing", "Quoted", "Approved", "Rejected", "Completed"];
const PROJECT_PAYMENT_STATUSES = ["Unpaid", "Deposit paid", "Part paid", "Paid", "Refunded"];

const projectApi = (row) => {
  const service = findService(row.service);
  /* Starting prices are USD; older enquiries may still carry a converted
     amount, so the stored value wins and the catalogue is the fallback. */
  const fallbackPrice = service ? startingPrice(service) : 0;
  return {
    id: row.id,
    reference: `SBD-${String(row.id).slice(0, 8).toUpperCase()}`,
    fullName: row.full_name,
    businessName: row.business_name || "",
    email: row.email,
    phone: row.phone,
    service: row.service,
    serviceName: service?.name || row.service,
    currency: row.currency,
    startingPrice: {
      amount: Number(row.starting_price_amount ?? fallbackPrice) || 0,
      currency: row.starting_price_currency || row.currency,
    },
    estimatedBudget: row.estimated_budget || "",
    description: row.description,
    additionalRequirements: row.additional_requirements || "",
    status: row.status,
    quotationAmount: row.quotation_amount === null ? null : Number(row.quotation_amount),
    quotationCurrency: row.quotation_currency || row.currency,
    includedServices: row.included_services || "",
    costLines: Array.isArray(row.cost_lines) ? row.cost_lines : [],
    paymentArrangement: row.payment_arrangement || "",
    paymentStatus: row.payment_status || "Unpaid",
    paymentReference: row.payment_reference || "",
    history: Array.isArray(row.history) ? row.history : [],
    notificationStatus: row.notification_status || "pending",
    notificationError: row.notification_error || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

router.get("/projects", async (req, res, next) => {
  try {
    const status = PROJECT_STATUSES.includes(String(req.query.status)) ? req.query.status : "";
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select * from project_enquiries
        where ($1 = '' or status = $1)
          and ($2 = '%%'
               or full_name ilike $2
               or business_name ilike $2
               or email ilike $2
               or phone ilike $2
               or service ilike $2)
        order by created_at desc
        limit 200`,
      [status, q]
    );
    res.json({ enquiries: rows.map(projectApi), total: rows.length });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = await one("select * from project_enquiries where id = $1", [id]);
    if (!row) return res.status(404).json({ error: "That project enquiry was not found." });
    res.json({ project: projectApi(row) });
  } catch (error) {
    next(error);
  }
});

const projectPatch = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  quotationAmount: z.union([z.number().nonnegative(), z.null()]).optional(),
  quotationCurrency: z.enum(["NGN", "USD"]).nullable().optional(),
  includedServices: z.string().trim().max(4000).optional(),
  costLines: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Give every additional cost a label.").max(160),
        amount: z.number().nonnegative("Costs cannot be negative."),
      })
    )
    .max(20)
    .optional(),
  paymentArrangement: z.string().trim().max(1000).optional(),
  paymentStatus: z.enum(PROJECT_PAYMENT_STATUSES).optional(),
  paymentReference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional().default(""),
});

router.patch("/projects/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = projectPatch.parse(req.body);
    const existing = await one("select * from project_enquiries where id = $1", [id]);
    if (!existing) return res.status(404).json({ error: "That project enquiry was not found." });

    const changes = [];
    if (body.status && body.status !== existing.status) {
      changes.push(`Status changed from ${existing.status} to ${body.status}`);
    }
    if (body.quotationAmount !== undefined) {
      changes.push(
        body.quotationAmount === null
          ? "Quotation cleared"
          : `Quotation set to ${body.quotationCurrency || existing.quotation_currency || existing.currency} ${body.quotationAmount.toFixed(2)}`
      );
    }
    if (body.costLines !== undefined && JSON.stringify(body.costLines) !== JSON.stringify(existing.cost_lines || [])) {
      changes.push("Additional costs updated");
    }
    if (body.includedServices !== undefined && body.includedServices !== (existing.included_services || "")) {
      changes.push("Included services updated");
    }
    if (body.paymentArrangement !== undefined && body.paymentArrangement !== (existing.payment_arrangement || "")) {
      changes.push("Payment arrangement updated");
    }
    if (body.paymentStatus && body.paymentStatus !== existing.payment_status) {
      changes.push(`Payment status changed from ${existing.payment_status} to ${body.paymentStatus}`);
    }
    if (body.paymentReference !== undefined && body.paymentReference !== (existing.payment_reference || "")) {
      changes.push("Payment reference updated");
    }

    const history = Array.isArray(existing.history) ? [...existing.history] : [];
    const note = changes.join(". ");
    if (note || body.note) {
      history.push({
        at: new Date().toISOString(),
        by: req.user.email,
        note: [note, body.note].filter(Boolean).join(". "),
      });
    }

    const row = await one(
      `update project_enquiries
          set status = coalesce($2, status),
              quotation_amount = $3,
              quotation_currency = $4,
              included_services = coalesce($5, included_services),
              cost_lines = $6,
              payment_arrangement = coalesce($7, payment_arrangement),
              payment_status = coalesce($8, payment_status),
              payment_reference = coalesce($9, payment_reference),
              history = $10::jsonb,
              updated_at = now()
        where id = $1
        returning *`,
      [
        id,
        body.status ?? null,
        body.quotationAmount === undefined ? existing.quotation_amount : body.quotationAmount,
        body.quotationAmount === undefined
          ? existing.quotation_currency
          : body.quotationCurrency ?? existing.quotation_currency ?? existing.currency,
        body.includedServices ?? null,
        JSON.stringify(body.costLines === undefined ? existing.cost_lines || [] : body.costLines),
        body.paymentArrangement ?? null,
        body.paymentStatus ?? null,
        body.paymentReference ?? null,
        JSON.stringify(history),
      ]
    );

    res.json({ project: projectApi(row), message: "Project enquiry updated." });
  } catch (error) {
    next(error);
  }
});

/* AI usage and spend, operator-only. Customers must never see these internal
   dollar figures: they only ever see their SBD AI credit allowance. */
router.get("/usage", async (req, res, next) => {
  try {
    const month = await one(
      `select
         coalesce(sum(case when created_at >= date_trunc('month', now()) then cost_usd else 0 end), 0) as month_cost,
         coalesce(sum(case when created_at >= date_trunc('month', now()) then credits else 0 end), 0) as month_credits,
         count(case when created_at >= date_trunc('month', now()) then 1 end)::int as month_requests,
         coalesce(sum(case when created_at >= date_trunc('month', now()) then prompt_tokens else 0 end), 0) as month_prompt_tokens,
         coalesce(sum(case when created_at >= date_trunc('month', now()) then cached_tokens else 0 end), 0) as month_cached_tokens,
         coalesce(sum(case when created_at >= date_trunc('month', now()) then completion_tokens else 0 end), 0) as month_completion_tokens,
         coalesce(sum(cost_usd), 0) as all_cost,
         coalesce(sum(credits), 0) as all_credits,
         count(*)::int as all_requests
       from ai_usage_events`
    );

    const customers = await query(
      `select u.id as user_id, u.full_name, u.email, u.suspended_at,
              s.plan_id, coalesce(p.name, s.plan_id) as plan_name,
              p.credit_limit, p.underlying_cost,
              coalesce(s.credits_used, 0) as credits_used,
              coalesce(s.spending_used, 0) as spending_used,
              coalesce(e.requests, 0) as requests,
              coalesce(e.prompt_tokens, 0) as prompt_tokens,
              coalesce(e.cached_tokens, 0) as cached_tokens,
              coalesce(e.completion_tokens, 0) as completion_tokens,
              coalesce(e.cost_usd, 0) as cost_usd
         from users u
         left join subscriptions s on s.user_id = u.id
         left join plans p on p.id = s.plan_id
         left join (
           select user_id,
                  count(*) as requests,
                  sum(prompt_tokens) as prompt_tokens,
                  sum(cached_tokens) as cached_tokens,
                  sum(completion_tokens) as completion_tokens,
                  sum(cost_usd) as cost_usd
             from ai_usage_events
            where created_at >= date_trunc('month', now())
            group by user_id
         ) e on e.user_id = u.id
        where u.role = 'client'
        order by coalesce(e.cost_usd, 0) desc, u.created_at desc
        limit 200`
    );

    const plans = await query(
      `select s.plan_id, coalesce(p.name, s.plan_id) as plan_name,
              count(*)::int as customers,
              coalesce(sum(s.credits_used), 0) as credits_used,
              coalesce(sum(s.spending_used), 0) as spending_used
         from subscriptions s
         left join plans p on p.id = s.plan_id
        group by s.plan_id, p.name
        order by s.plan_id`
    );

    res.json({
      monthLabel: new Date().toISOString().slice(0, 7),
      totals: {
        costUsd: Number(month?.month_cost || 0),
        credits: Number(month?.month_credits || 0),
        requests: Number(month?.month_requests || 0),
        promptTokens: Number(month?.month_prompt_tokens || 0),
        cachedTokens: Number(month?.month_cached_tokens || 0),
        completionTokens: Number(month?.month_completion_tokens || 0),
        allTimeCostUsd: Number(month?.all_cost || 0),
        allTimeCredits: Number(month?.all_credits || 0),
        allTimeRequests: Number(month?.all_requests || 0),
      },
      customers: customers.map((row) => {
        const creditsUsed = Number(row.credits_used || 0);
        const creditLimit = row.credit_limit == null ? null : Number(row.credit_limit);
        const spendingUsed = Number(row.spending_used || 0);
        const spendingCap = row.underlying_cost == null ? null : Number(row.underlying_cost);
        const creditPercent = creditLimit ? Math.min(100, Math.round((creditsUsed / creditLimit) * 100)) : null;
        const spendPercent = spendingCap ? Math.min(100, Math.round((spendingUsed / spendingCap) * 100)) : null;
        const atLimit = (creditLimit != null && creditsUsed >= creditLimit) ||
          (spendingCap != null && spendingUsed >= spendingCap);
        const approaching = !atLimit && ((creditPercent ?? 0) >= 80 || (spendPercent ?? 0) >= 80);
        return {
          userId: row.user_id,
          name: row.full_name,
          email: row.email,
          planId: row.plan_id,
          planName: row.plan_name || "No plan",
          creditsUsed,
          creditLimit,
          creditPercent,
          spendingUsed,
          spendingCap,
          spendPercent,
          requests: Number(row.requests || 0),
          promptTokens: Number(row.prompt_tokens || 0),
          cachedTokens: Number(row.cached_tokens || 0),
          completionTokens: Number(row.completion_tokens || 0),
          costUsd: Number(row.cost_usd || 0),
          atLimit,
          approaching,
        };
      }),
      plans: plans.map((row) => ({
        planId: row.plan_id,
        planName: row.plan_name || row.plan_id,
        customers: Number(row.customers || 0),
        creditsUsed: Number(row.credits_used || 0),
        spendingUsed: Number(row.spending_used || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- additional-credit packages ---------- */
/* The operator is the only source of package prices and credit amounts. Until
   a package is created and active, the customer's purchase button stays
   disabled. */

const packageSchema = z.object({
  name: z.string().trim().min(2, "Give the pack a name.").max(80),
  credits: z.coerce.number().int().min(1, "Credits must be at least 1.").max(10_000_000),
  price: z.coerce.number().min(0.01, "The price must be greater than zero.").max(1_000_000),
  currency: z.string().trim().length(3).optional().default("USD"),
  active: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
});

router.get("/credit-packages", async (req, res, next) => {
  try {
    const rows = await query(
      `select * from credit_packages order by sort_order asc, credits asc`
    );
    const sold = await one(
      `select count(*)::int as purchases, coalesce(sum(credits), 0)::int as credits
         from credit_purchases`
    );
    res.json({
      packages: rows.map((row) => ({
        id: row.id,
        name: row.name,
        credits: Number(row.credits),
        price: Number(row.price),
        currency: row.currency,
        active: Boolean(row.active),
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      })),
      sold: { purchases: Number(sold?.purchases || 0), credits: Number(sold?.credits || 0) },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/credit-packages", async (req, res, next) => {
  try {
    const body = packageSchema.parse(req.body || {});
    const row = await one(
      `insert into credit_packages (name, credits, price, currency, active, sort_order)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [body.name, body.credits, body.price, body.currency.toUpperCase(), body.active, body.sortOrder]
    );
    res.status(201).json({
      package: {
        id: row.id,
        name: row.name,
        credits: Number(row.credits),
        price: Number(row.price),
        currency: row.currency,
        active: Boolean(row.active),
      },
      message: `${row.credits.toLocaleString("en-GB")} credit pack created. It is now purchasable.`,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/credit-packages/:id", async (req, res, next) => {
  try {
    const body = packageSchema.partial().parse(req.body || {});
    const existing = await one("select * from credit_packages where id = $1", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Credit pack not found." });
    const row = await one(
      `update credit_packages
          set name = coalesce($2, name),
              credits = coalesce($3, credits),
              price = coalesce($4, price),
              currency = coalesce($5, currency),
              active = coalesce($6, active),
              sort_order = coalesce($7, sort_order),
              updated_at = now()
        where id = $1
        returning *`,
      [
        req.params.id,
        body.name ?? null,
        body.credits ?? null,
        body.price ?? null,
        body.currency ? body.currency.toUpperCase() : null,
        body.active ?? null,
        body.sortOrder ?? null,
      ]
    );
    res.json({
      package: {
        id: row.id,
        name: row.name,
        credits: Number(row.credits),
        price: Number(row.price),
        currency: row.currency,
        active: Boolean(row.active),
      },
      message: "Credit pack updated.",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/credit-packages/:id", async (req, res, next) => {
  try {
    const row = await one("delete from credit_packages where id = $1 returning id", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ error: "Credit pack not found." });
    res.json({ ok: true, message: "Credit pack removed. Existing purchases are not affected." });
  } catch (error) {
    next(error);
  }
});

/* ---- Support tickets ---------------------------------------------------- */
router.get("/support", async (req, res, next) => {
  try {
    const status = String(req.query.status || "").trim();
    const q = String(req.query.q || "").trim();
    const rows = await query(
      `select t.*, u.full_name, u.email, u.business_name,
              (select count(*)::int from support_messages m where m.ticket_id = t.id) as message_count,
              (select body from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message
         from support_tickets t
         join users u on u.id = t.user_id
        where ($1 = '' or t.status = $1)
          and ($2 = '' or t.subject ilike '%' || $2 || '%' or u.email ilike '%' || $2 || '%' or u.full_name ilike '%' || $2 || '%')
        order by t.updated_at desc
        limit 200`,
      [status, q]
    );
    res.json({
      tickets: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        category: row.category,
        priority: row.priority,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: Number(row.message_count || 0),
        lastMessage: row.last_message || "",
        customer: { name: row.full_name, email: row.email, businessName: row.business_name },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support/:id", async (req, res, next) => {
  try {
    const ticket = await one(
      `select t.*, u.full_name, u.email, u.business_name, u.id as user_id
         from support_tickets t join users u on u.id = t.user_id
        where t.id = $1`,
      [req.params.id]
    );
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    const messages = await query(
      `select id, author_role, body, created_at from support_messages where ticket_id = $1 order by created_at asc`,
      [ticket.id]
    );
    res.json({
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
        customer: {
          id: ticket.user_id,
          name: ticket.full_name,
          email: ticket.email,
          businessName: ticket.business_name,
        },
      },
      messages: messages.map((row) => ({ id: row.id, author: row.author_role, body: row.body, createdAt: row.created_at })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/support/:id/messages", async (req, res, next) => {
  try {
    const body = String(req.body?.message || "").trim();
    if (!body) return res.status(400).json({ error: "Write a reply first." });
    const ticket = await one("select * from support_tickets where id = $1", [req.params.id]);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    await query(
      `insert into support_messages (ticket_id, author_role, author_id, body) values ($1, 'staff', $2, $3)`,
      [ticket.id, req.user.id, body]
    );
    await query(
      `update support_tickets set status = 'pending', updated_at = now(), last_staff_reply_at = now() where id = $1`,
      [ticket.id]
    );
    await createNotification({
      userId: ticket.user_id,
      kind: "support_reply",
      title: "Support replied to your ticket",
      body: `We replied to "${ticket.subject}". Open Support in your dashboard to read it.`,
      link: "/dashboard?tab=support",
      dedupeKey: `support:${ticket.id}:${Date.now()}`,
      emailSubject: "Support replied to your ticket",
      emailText: `We replied to "${ticket.subject}". Open Support in your dashboard to read it.`,
    }).catch(() => {});
    await logAudit({ actorId: req.user.id, action: "support.reply", target: ticket.id, meta: { subject: ticket.subject } });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/support/:id", async (req, res, next) => {
  try {
    const status = String(req.body?.status || "").trim();
    const priority = String(req.body?.priority || "").trim();
    if (status && !["open", "pending", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Unknown ticket status." });
    }
    if (priority && !["low", "normal", "high", "urgent"].includes(priority)) {
      return res.status(400).json({ error: "Unknown priority." });
    }
    const ticket = await one(
      `update support_tickets
          set status = coalesce(nullif($2, ''), status),
              priority = coalesce(nullif($3, ''), priority),
              updated_at = now()
        where id = $1 returning *`,
      [req.params.id, status, priority]
    );
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    await logAudit({ actorId: req.user.id, action: "support.update", target: ticket.id, meta: { status: ticket.status, priority: ticket.priority } });
    res.json({ ticket: { id: ticket.id, status: ticket.status, priority: ticket.priority } });
  } catch (error) {
    next(error);
  }
});


/* ---- Subscription management ------------------------------------------- */
router.get("/subscriptions", async (req, res, next) => {
  try {
    const status = String(req.query.status || "").trim();
    const q = String(req.query.q || "").trim();
    const rows = await query(
      `select s.*, u.full_name, u.email, u.business_name, p.name as plan_name, p.price, p.currency,
              p.credit_limit, p.message_limit
         from subscriptions s
         join users u on u.id = s.user_id
         left join plans p on p.id = s.plan_id
        where ($1 = '' or s.status = $1)
          and ($2 = '' or u.email ilike '%' || $2 || '%' or u.full_name ilike '%' || $2 || '%')
        order by s.updated_at desc
        limit 200`,
      [status, q]
    );
    res.json({
      subscriptions: rows.map((row) => ({
        userId: row.user_id,
        customer: { name: row.full_name, email: row.email, businessName: row.business_name },
        planId: row.plan_id,
        planName: row.plan_name || row.plan_id,
        price: Number(row.price || 0),
        currency: row.currency || "USD",
        status: row.status,
        startedAt: row.started_at,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        creditsUsed: Number(row.credits_used || 0),
        creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
        agentAllowance: row.agent_allowance ?? null,
      })),
      plans: (await query("select id, name, price, currency, custom from plans order by sort_order asc")).map((row) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        currency: row.currency,
        custom: Boolean(row.custom),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/subscriptions/:userId", async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["active", "canceled", "past_due", "expired"]).optional(),
        planId: z.string().trim().min(1).max(60).optional(),
      })
      .refine((data) => data.status || data.planId, { message: "Choose a status or a plan." })
      .parse(req.body || {});

    if (body.planId) {
      const plan = await one("select id from plans where id = $1", [body.planId]);
      if (!plan) return res.status(400).json({ error: "That plan does not exist." });
    }

    const updated = await one(
      `update subscriptions
          set status = coalesce($2, status),
              plan_id = coalesce($3, plan_id),
              updated_at = now()
        where user_id = $1
        returning *`,
      [req.params.userId, body.status || null, body.planId || null]
    );
    if (!updated) return res.status(404).json({ error: "Subscription not found." });

    await logAudit({
      actorId: req.user.id,
      action: "subscription.update",
      target: req.params.userId,
      meta: { status: updated.status, planId: updated.plan_id },
    });

    res.json({
      ok: true,
      subscription: {
        userId: updated.user_id,
        planId: updated.plan_id,
        status: updated.status,
        currentPeriodEnd: updated.current_period_end,
      },
      message: "Subscription updated.",
    });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Check the details." });
    }
    next(error);
  }
});

router.post("/payments/:id/refund", async (req, res, next) => {
  try {
    const body = z
      .object({
        amount: z.coerce.number().positive().optional(),
        reason: z.string().trim().max(300).optional().default(""),
      })
      .parse(req.body || {});

    const payment = await one("select * from payments where id = $1", [req.params.id]);
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (payment.status !== "paid") {
      return res.status(400).json({ error: "Only a verified payment can be refunded." });
    }
    const existing = await one("select id from refunds where payment_id = $1", [payment.id]);
    if (existing) return res.status(409).json({ error: "This payment has already been refunded." });

    const amount = Number(body.amount || payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(payment.amount)) {
      return res.status(400).json({ error: "Refund amount must be between 0 and the payment amount." });
    }

    const refund = await one(
      `insert into refunds (payment_id, user_id, amount, currency, reason, refunded_by)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (payment_id) do nothing
       returning *`,
      [payment.id, payment.user_id, amount, payment.currency || "USD", body.reason || "Operator refund", req.user.id]
    );
    if (!refund) return res.status(409).json({ error: "This payment has already been refunded." });

    await query("update payments set status = 'refunded' where id = $1", [payment.id]);
    await logAudit({
      actorId: req.user.id,
      action: "payment.refund",
      target: payment.id,
      meta: { amount, currency: payment.currency, reason: body.reason || "" },
    });
    await createNotification({
      userId: payment.user_id,
      kind: "billing",
      title: "Refund recorded",
      body: `${payment.currency || "USD"} ${amount.toFixed(2)} was refunded for invoice ${payment.reference || payment.id}.`,
      link: "/dashboard?tab=subscriptions",
      dedupeKey: `refund:${payment.id}`,
      emailSubject: "Your refund has been recorded",
      emailText: `A refund of ${payment.currency || "USD"} ${amount.toFixed(2)} has been recorded for invoice ${payment.reference || payment.id}.`,
    }).catch(() => {});

    res.json({ ok: true, refund: { id: refund.id, amount, currency: refund.currency }, message: "Refund recorded." });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Check the refund details." });
    }
    next(error);
  }
});

/* ---- Custom requests ---------------------------------------------------- */
router.get("/custom-requests", async (req, res, next) => {
  try {
    const status = String(req.query.status || "");
    const rows = await query(
      `select r.*, u.full_name as customer_name, u.email as customer_email,
              (select count(*)::int from custom_offers o where o.request_id = r.id) as offer_count
         from custom_requests r
         join users u on u.id = r.user_id
        where ($1 = '' or r.status = $1)
        order by r.updated_at desc limit 100`,
      [status]
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id, title: row.title, kind: row.kind, product: row.product, status: row.status,
        requirements: row.requirements, expectedUsage: row.expected_usage, budget: row.budget,
        billingPreference: row.billing_preference, websites: row.websites, whatsappNumbers: row.whatsapp_numbers,
        adminNotes: row.admin_notes, assignedTo: row.assigned_to, offerCount: row.offer_count,
        customer: { id: row.user_id, name: row.customer_name, email: row.customer_email },
        createdAt: row.created_at, updatedAt: row.updated_at,
      })),
    });
  } catch (error) { next(error); }
});

router.get("/custom-requests/:id", async (req, res, next) => {
  try {
    const request = await one(
      `select r.*, u.full_name as customer_name, u.email as customer_email
         from custom_requests r join users u on u.id = r.user_id where r.id = $1`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: "Request not found." });
    const offers = await query(
      "select * from custom_offers where request_id = $1 order by created_at desc",
      [request.id]
    );
    res.json({
      request: {
        id: request.id, title: request.title, kind: request.kind, product: request.product,
        status: request.status, requirements: request.requirements, expectedUsage: request.expected_usage,
        budget: request.budget, billingPreference: request.billing_preference, websites: request.websites,
        whatsappNumbers: request.whatsapp_numbers, adminNotes: request.admin_notes, assignedTo: request.assigned_to,
        contactName: request.contact_name, businessName: request.business_name, email: request.email, phone: request.phone,
        customer: { id: request.user_id, name: request.customer_name, email: request.customer_email },
        createdAt: request.created_at, updatedAt: request.updated_at,
      },
      offers: offers.map((offer) => ({
        id: offer.id, name: offer.name, description: offer.description, price: Number(offer.price),
        currency: offer.currency, billingPeriod: offer.billing_period, credits: offer.credits,
        customerLimit: offer.customer_limit, websiteLimit: offer.website_limit,
        includedFeatures: offer.included_features, conditions: offer.conditions, status: offer.status,
        revisionNote: offer.revision_note, paymentId: offer.payment_id, expiresAt: offer.expires_at,
        createdAt: offer.created_at,
      })),
    });
  } catch (error) { next(error); }
});

router.patch("/custom-requests/:id", async (req, res, next) => {
  try {
    const body = z.object({
      status: z.enum(["pending", "reviewing", "offer_sent", "awaiting_customer", "approved", "rejected", "completed"]).optional(),
      adminNotes: z.string().trim().max(4000).optional(),
      assignedTo: z.string().trim().max(120).optional(),
    }).parse(req.body || {});
    const request = await one("select * from custom_requests where id = $1", [req.params.id]);
    if (!request) return res.status(404).json({ error: "Request not found." });
    const updated = await one(
      `update custom_requests
          set status = coalesce($2, status), admin_notes = coalesce($3, admin_notes),
              assigned_to = coalesce($4, assigned_to), updated_at = now()
        where id = $1 returning *`,
      [request.id, body.status ?? null, body.adminNotes ?? null, body.assignedTo ?? null]
    );
    await logAudit({ actorId: req.user.id, action: "custom_request.update", target: request.id, meta: body });
    if (body.status) {
      await createNotification({
        userId: request.user_id, kind: "project", title: `Custom request ${body.status.replace(/_/g, " ")}`,
        body: `Your request “${request.title}” is now ${body.status.replace(/_/g, " ")}.`,
        link: "/dashboard?tab=requests", dedupeKey: `creq:${request.id}:${body.status}:${Date.now()}`,
      }).catch(() => {});
    }
    res.json({ ok: true, request: { id: updated.id, status: updated.status }, message: "Request updated." });
  } catch (error) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.issues[0]?.message || "Check the update." });
    next(error);
  }
});

router.post("/custom-requests/:id/offers", async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(3).max(160),
      description: z.string().trim().max(4000).default(""),
      price: z.coerce.number().positive().max(1000000),
      currency: z.enum(["USD", "NGN"]).default("USD"),
      billingPeriod: z.enum(["one-off", "monthly", "annual"]).default("one-off"),
      credits: z.coerce.number().int().min(0).max(10000000).optional(),
      customerLimit: z.coerce.number().int().min(0).max(1000000).optional(),
      websiteLimit: z.coerce.number().int().min(0).max(10000).optional(),
      assistantLimit: z.coerce.number().int().min(0).max(10000).optional(),
      zeroCost: z.boolean().default(false),
      includedFeatures: z.string().trim().max(2000).default(""),
      conditions: z.string().trim().max(2000).default(""),
      expiresInDays: z.coerce.number().int().min(1).max(120).default(14),
      send: z.boolean().default(true),
    }).parse(req.body || {});
    const request = await one("select * from custom_requests where id = $1", [req.params.id]);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status === "approved") return res.status(400).json({ error: "This request is already approved." });

    if (body.zeroCost && Number(body.price) !== 0) {
      return res.status(400).json({ error: "A zero-cost offer must have a price of 0." });
    }
    if (!body.zeroCost && Number(body.price) <= 0) {
      return res.status(400).json({ error: "Set a price, or explicitly mark the offer zero-cost." });
    }
    const offer = await one(
      `insert into custom_offers
         (request_id, name, description, price, currency, billing_period, credits, customer_limit,
          website_limit, assistant_limit, zero_cost, included_features, conditions, expires_at, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() + ($14 || ' days')::interval, $15)
       returning *`,
      [request.id, body.name, body.description, body.price, body.currency, body.billingPeriod,
       body.credits ?? null, body.customerLimit ?? null, body.websiteLimit ?? null,
       body.assistantLimit ?? null, body.zeroCost,
       body.includedFeatures, body.conditions, String(body.expiresInDays), body.send ? "sent" : "draft"]
    );
    if (body.send) {
      await query("update custom_requests set status = 'offer_sent', updated_at = now() where id = $1", [request.id]);
      await createNotification({
        userId: request.user_id, kind: "project", title: "You have a new offer",
        body: `${offer.name} — ${offer.currency} ${Number(offer.price).toFixed(2)}. Review and accept it from Custom requests.`,
        link: "/dashboard?tab=requests", dedupeKey: `offer:${offer.id}`,
      }).catch(() => {});
    }
    await logAudit({ actorId: req.user.id, action: "custom_request.offer", target: request.id, meta: { offerId: offer.id, price: body.price, currency: body.currency } });
    res.status(201).json({ ok: true, offer: { id: offer.id, status: offer.status }, message: body.send ? "Offer sent." : "Draft saved." });
  } catch (error) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.issues[0]?.message || "Check the offer." });
    next(error);
  }
});

router.patch("/custom-requests/:id/offers/:offerId", async (req, res, next) => {
  try {
    const body = z.object({ action: z.enum(["send", "withdraw"]) }).parse(req.body || {});
    const offer = await one("select * from custom_offers where id = $1 and request_id = $2", [
      req.params.offerId, req.params.id,
    ]);
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (["paid", "accepted"].includes(offer.status)) {
      return res.status(400).json({ error: "An accepted or paid offer cannot be changed." });
    }
    const status = body.action === "send" ? "sent" : "withdrawn";
    await query("update custom_offers set status = $2, updated_at = now() where id = $1", [offer.id, status]);
    if (status === "sent") {
      await query("update custom_requests set status = 'offer_sent', updated_at = now() where id = $1", [offer.request_id]);
    }
    await logAudit({ actorId: req.user.id, action: `custom_request.offer.${body.action}`, target: offer.request_id, meta: { offerId: offer.id } });
    res.json({ ok: true, message: status === "sent" ? "Offer sent." : "Offer withdrawn." });
  } catch (error) {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Choose send or withdraw." });
    next(error);
  }
});

/* ---- Financial analytics, notifications and integrations ---------------- */
router.get("/revenue", async (req, res, next) => {
  try {
    const { days, from, to } = rangeFrom(req.query);
    const report = await revenueReport(from, to);
    res.json({ ...report, days });
  } catch (error) {
    next(error);
  }
});

router.get("/revenue/export.csv", async (req, res, next) => {
  try {
    const { days, from, to } = rangeFrom(req.query);
    const report = await revenueReport(from, to);
    const lines = [
      ["Section", "Label", "Value", "Currency"],
      ["Summary", "Period (days)", String(days), ""],
      ["Summary", "Collected in period", report.revenue.collectedInRange.toFixed(2), "USD"],
      ["Summary", "Collected all time", report.revenue.collectedAllTime.toFixed(2), "USD"],
      ["Summary", "Monthly recurring revenue", report.revenue.mrr.toFixed(2), "USD"],
      ["Summary", "Active paying customers", String(report.revenue.activePayingCustomers), ""],
      ["Summary", "Pending payments", String(report.payments.pending), ""],
      ["Summary", "Failed payments", String(report.payments.failed), ""],
      ["Summary", "New customers in period", String(report.customers.newInRange), ""],
      ["Summary", "AI credits used", String(report.usage.creditsUsed), ""],
      ...report.byPlan.map((row) => ["Plan revenue", row.name, row.usd.toFixed(2), "USD"]),
      ...report.byKind.map((row) => ["Payment type", row.kind, row.usd.toFixed(2), "USD"]),
      ...report.byMonth.map((row) => ["Monthly revenue", row.month, row.usd.toFixed(2), "USD"]),
    ];
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sbd-revenue-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const items = await notificationFeed(req.user.id);
    res.json({ notifications: items, unread: items.filter((item) => !item.read).length });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/read", async (req, res, next) => {
  try {
    const marked = await markNotificationsRead(req.user.id, req.body?.keys);
    res.json({ marked });
  } catch (error) {
    next(error);
  }
});

router.get("/audit", async (req, res, next) => {
  try {
    const rows = await query(
      `select a.id, a.action, a.target, a.meta, a.created_at, u.full_name, u.email
         from audit_log a left join users u on u.id = a.actor_id
        order by a.created_at desc limit 100`
    );
    res.json({
      entries: rows.map((row) => ({
        id: row.id,
        action: row.action,
        target: row.target,
        meta: row.meta,
        createdAt: row.created_at,
        actor: row.email ? `${row.full_name} (${row.email})` : "system",
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/integrations", (req, res) => {
  res.json({ integrations: integrationStatus() });
});

export default router;
