import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAdmin, publicUser } from "../auth.js";
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
            status: subscription.status,
            agentAllowance: subscription.agent_allowance ?? null,
          }
        : null,
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

    await activatePayment(payment, { verifiedBy: req.user.id, method: payment.method || "transfer" });
    res.json({ ok: true, message: `Payment verified. The customer is now on the plan.` });
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

export default router;
