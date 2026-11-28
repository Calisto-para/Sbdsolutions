import { query, one } from "./db.js";

/* Operator-only reporting. Every figure comes from stored records; anything
   that is an estimate is labelled as one by the caller. Money is reported in
   US Dollars only when the payment currency is USD — other currencies are
   counted separately rather than converted at an invented rate. */

const num = (value) => Number(value || 0);

export function rangeFrom(query) {
  const days = Math.max(1, Math.min(730, Number(query?.days) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, from, to };
}

export async function revenueReport(from, to) {
  const [period, allTime, mrr, byPlan, byKind, months, customers, renewals, usage, cancelled, refunds] =
    await Promise.all([
      one(
        `select
           coalesce(sum(case when status = 'paid' and currency = 'USD' then amount else 0 end), 0) as usd_paid,
           coalesce(sum(case when status = 'paid' and currency <> 'USD' then amount else 0 end), 0) as other_paid,
           count(*) filter (where status = 'paid') as paid_count,
           count(*) filter (where status = 'pending') as pending_count,
           coalesce(sum(case when status = 'pending' then amount else 0 end), 0) as pending_amount,
           count(*) filter (where status = 'rejected') as failed_count,
           coalesce(sum(case when status = 'rejected' then amount else 0 end), 0) as failed_amount
         from payments
        where created_at >= $1 and created_at < $2`,
        [from, to]
      ),
      one(
        `select coalesce(sum(amount), 0) as usd
           from payments
          where status = 'paid' and currency = 'USD'`
      ),
      one(
        `select coalesce(sum(p.price), 0) as mrr, count(*)::int as active
           from subscriptions s
           join plans p on p.id = s.plan_id
          where s.status = 'active' and p.currency = 'USD' and p.price > 0`
      ),
      query(
        `select coalesce(p.name, pa.plan_id, 'Other') as name,
                coalesce(sum(case when pa.currency = 'USD' then pa.amount else 0 end), 0) as usd,
                count(*)::int as payments
           from payments pa
           left join plans p on p.id = pa.plan_id
          where pa.status = 'paid' and pa.created_at >= $1 and pa.created_at < $2
          group by 1
          order by usd desc`,
        [from, to]
      ),
      query(
        `select coalesce(kind, 'plan') as kind,
                coalesce(sum(case when currency = 'USD' then amount else 0 end), 0) as usd,
                count(*)::int as payments
           from payments
          where status = 'paid' and created_at >= $1 and created_at < $2
          group by 1
          order by usd desc`,
        [from, to]
      ),
      query(
        `select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
                coalesce(sum(case when currency = 'USD' then amount else 0 end), 0) as usd,
                count(*)::int as payments
           from payments
          where status = 'paid' and created_at >= now() - interval '11 months'
          group by 1
          order by 1`
      ),
      one(
        `select count(*)::int as total,
                count(*) filter (where created_at >= $1 and created_at < $2)::int as in_range
           from users
          where role <> 'admin'`,
        [from, to]
      ),
      one(
        `select count(*)::int as soon
           from subscriptions
          where status = 'active' and current_period_end between now() and now() + interval '30 days'`
      ),
      one(
        `select coalesce(sum(s.credits_used), 0) as credits_used,
                coalesce(sum(s.spending_used), 0) as ai_spend_estimate,
                (select count(*)::int from conversations where created_at >= date_trunc('month', now())) as conversations_month,
                (select count(*)::int from messages where created_at >= date_trunc('month', now())) as messages_month,
                (select count(*)::int from leads where created_at >= date_trunc('month', now())) as leads_month
           from subscriptions s`
      ),
      one(
        `select count(*)::int as count
           from subscriptions
          where status <> 'active' and updated_at >= $1 and updated_at < $2`,
        [from, to]
      ),
      one(
        `select coalesce(sum(case when currency = 'USD' then amount else 0 end), 0) as usd,
                count(*)::int as count
           from refunds
          where created_at >= $1 and created_at < $2`,
        [from, to]
      ),
    ]);

  const activePaying = num(mrr?.active);
  const collectedInRange = num(period?.usd_paid);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    currency: "USD",
    refunds: { usd: num(refunds?.usd), count: num(refunds?.count) },
    revenue: {
      collectedInRange,
      netInRange: collectedInRange - num(refunds?.usd),
      collectedAllTime: num(allTime?.usd),
      otherCurrencyInRange: num(period?.other_paid),
      mrr: num(mrr?.mrr),
      arrProjected: num(mrr?.mrr) * 12,
      arpuEstimate: activePaying ? collectedInRange / activePaying : 0,
      activePayingCustomers: activePaying,
    },
    payments: {
      paid: num(period?.paid_count),
      pending: num(period?.pending_count),
      pendingAmount: num(period?.pending_amount),
      failed: num(period?.failed_count),
      failedAmount: num(period?.failed_amount),
    },
    customers: { total: num(customers?.total), newInRange: num(customers?.in_range), cancelled: num(cancelled?.count) },
    renewalsNext30Days: num(renewals?.soon),
    byPlan: byPlan.map((row) => ({ name: row.name, usd: num(row.usd), payments: num(row.payments) })),
    byKind: byKind.map((row) => ({ kind: row.kind, usd: num(row.usd), payments: num(row.payments) })),
    byMonth: months.map((row) => ({ month: row.month, usd: num(row.usd), payments: num(row.payments) })),
    usage: {
      creditsUsed: num(usage?.credits_used),
      aiSpendEstimate: num(usage?.ai_spend_estimate),
      conversationsThisMonth: num(usage?.conversations_month),
      messagesThisMonth: num(usage?.messages_month),
      leadsThisMonth: num(usage?.leads_month),
    },
  };
}

export function integrationStatus() {
  const has = (name) => Boolean(String(process.env[name] || "").trim());
  const email = has("BREVO_API_KEY") || has("BRAVO_API_KEY") || has("RESEND_API_KEY") || has("SMTP_HOST");
  return [
    {
      key: "openai",
      name: "OpenAI (AI replies)",
      connected: has("OPENAI_API_KEY"),
      note: has("OPENAI_API_KEY")
        ? "API key present on the server. Usage is charged to SBD's account."
        : "No OPENAI_API_KEY set. AI replies cannot be generated until it is configured.",
    },
    {
      key: "flutterwave",
      name: "Flutterwave (payments)",
      connected: has("FLUTTERWAVE_SECRET_KEY") || has("FLW_SECRET_KEY"),
      webhook: has("FLUTTERWAVE_WEBHOOK_SECRET") || has("FLW_WEBHOOK_SECRET"),
      note: "Server-side verification and webhook signature checks are implemented.",
    },
    {
      key: "paystack",
      name: "Paystack (payments)",
      connected: has("PAYSTACK_SECRET_KEY"),
      webhook: has("PAYSTACK_WEBHOOK_SECRET"),
      note: "Server-side verification and signed webhooks are implemented.",
    },
    {
      key: "email",
      name: "Email delivery",
      connected: email,
      note: email ? "A provider is configured." : "No email provider configured; notifications stay in-app.",
    },
    {
      key: "push",
      name: "Phone push (Firebase)",
      connected: has("FIREBASE_CLIENT_EMAIL") && has("FIREBASE_PRIVATE_KEY"),
      note: has("FIREBASE_CLIENT_EMAIL") && has("FIREBASE_PRIVATE_KEY")
        ? "Service account present."
        : "Firebase service-account credentials are missing, so push stays disabled.",
    },
    {
      key: "whatsapp",
      name: "WhatsApp Business (Meta)",
      connected: false,
      note: "Not configured. Requires Meta Business verification, a WhatsApp Business Account, phone number ID and system-user token. The product remains in development.",
    },
    {
      key: "database",
      name: "Database",
      connected: Boolean(String(process.env.DATABASE_URL || "").trim()),
      note: process.env.DATABASE_URL
        ? "External Postgres configured."
        : "Using the embedded PGlite store — not durable for production.",
    },
  ];
}

export async function notificationFeed(adminId) {
  const [users, payments, projects, tickets, reads] = await Promise.all([
    query(
      `select id, full_name, email, created_at from users
        where role <> 'admin' order by created_at desc limit 15`
    ),
    query(
      `select p.id, p.amount, p.currency, p.status, p.created_at, p.reference, u.full_name, u.email
         from payments p join users u on u.id = p.user_id
        order by p.created_at desc limit 20`
    ),
    query(
      `select id, full_name as name, email, created_at, status from project_enquiries
        order by created_at desc limit 10`
    ),
    query(
      `select t.id, t.subject, t.status, t.created_at, u.full_name, u.email
         from support_tickets t join users u on u.id = t.user_id
        order by t.created_at desc limit 10`
    ),
    query("select key from admin_notification_reads where user_id = $1", [adminId]),
  ]);

  const read = new Set(reads.map((row) => row.key));
  const items = [];

  for (const row of users) {
    items.push({
      key: `user:${row.id}`,
      type: "registration",
      title: "New customer registered",
      detail: `${row.full_name} · ${row.email}`,
      createdAt: row.created_at,
      href: "/admin",
    });
  }
  for (const row of payments) {
    const failed = row.status === "rejected";
    items.push({
      key: `payment:${row.id}`,
      type: failed ? "payment_failed" : row.status === "pending" ? "payment_pending" : "payment_paid",
      title: failed ? "Payment rejected" : row.status === "pending" ? "Payment awaiting verification" : "Payment received",
      detail: `${row.full_name} · ${row.currency} ${Number(row.amount).toFixed(2)}${row.reference ? ` · ${row.reference}` : ""}`,
      createdAt: row.created_at,
      href: "/admin?tab=payments",
    });
  }
  for (const row of projects) {
    items.push({
      key: `project:${row.id}`,
      type: "project_enquiry",
      title: "New project enquiry",
      detail: `${row.name} · ${row.email}`,
      createdAt: row.created_at,
      href: "/admin?tab=projects",
    });
  }
  for (const row of tickets) {
    items.push({
      key: `ticket:${row.id}`,
      type: "support_ticket",
      title: row.status === "open" ? "New support ticket" : "Support ticket updated",
      detail: `${row.subject} · ${row.full_name}`,
      createdAt: row.created_at,
      href: "/admin?tab=support",
    });
  }

  return items
    .map((item) => ({ ...item, read: read.has(item.key) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60);
}

export async function markNotificationsRead(adminId, keys) {
  const list = (Array.isArray(keys) ? keys : []).map((key) => String(key).slice(0, 200)).filter(Boolean).slice(0, 200);
  for (const key of list) {
    await query(
      `insert into admin_notification_reads (user_id, key) values ($1, $2)
       on conflict (user_id, key) do nothing`,
      [adminId, key]
    );
  }
  return list.length;
}
