import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { createNotification } from "../notify.js";
import { env } from "../env.js";
import { sendNotificationEmail } from "../mail.js";

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ["general", "billing", "technical", "whatsapp", "chatbot", "account"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

const createSchema = z.object({
  subject: z.string().trim().min(3, "Give the request a short subject.").max(160),
  message: z.string().trim().min(10, "Describe the issue in at least 10 characters.").max(5000),
  category: z.enum(CATEGORIES).default("general"),
  priority: z.enum(PRIORITIES).default("normal"),
});

const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });

const ticketView = (row) => ({
  id: row.id,
  subject: row.subject,
  category: row.category,
  priority: row.priority,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  messageCount: Number(row.message_count || 0),
  lastMessage: row.last_message || "",
  lastAuthor: row.last_author || "",
});

async function customerTicket(userId, id) {
  return one("select * from support_tickets where id = $1 and user_id = $2", [id, userId]);
}

async function notifyOperators(ticket, body) {
  const recipients = String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "")
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!recipients.length) return;
  for (const to of recipients) {
    await sendNotificationEmail(
      {
        title: `Support ticket: ${ticket.subject}`,
        text: `A customer opened a support ticket.\n\n${body}\n\nOpen the operations dashboard to reply.`,
        link: "/admin",
      },
      to
    ).catch((error) => console.error("[support] operator email failed:", error?.message || error));
  }
}

router.get("/", async (req, res, next) => {
  try {
    const rows = await query(
      `select t.*,
              (select count(*)::int from support_messages m where m.ticket_id = t.id) as message_count,
              (select body from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message,
              (select author_role from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_author
         from support_tickets t
        where t.user_id = $1
        order by t.updated_at desc
        limit 100`,
      [req.user.id]
    );
    res.json({ tickets: rows.map(ticketView) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body || {});
    const ticket = await one(
      `insert into support_tickets (user_id, subject, category, priority, last_customer_reply_at)
       values ($1, $2, $3, $4, now()) returning *`,
      [req.user.id, input.subject, input.category, input.priority]
    );
    await query(
      `insert into support_messages (ticket_id, author_role, author_id, body) values ($1, 'customer', $2, $3)`,
      [ticket.id, req.user.id, input.message]
    );
    notifyOperators(ticket, `${req.user.full_name} (${req.user.email})\n\n${input.subject}\n\n${input.message}`);
    res.status(201).json({ ticket: { ...ticketView({ ...ticket, message_count: 1, last_message: input.message, last_author: "customer" }) } });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Check the details and try again." });
    }
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const ticket = await customerTicket(req.user.id, req.params.id);
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
        updatedAt: ticket.updated_at,
      },
      messages: messages.map((row) => ({
        id: row.id,
        author: row.author_role,
        body: row.body,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    const input = replySchema.parse(req.body || {});
    const ticket = await customerTicket(req.user.id, req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    await query(
      `insert into support_messages (ticket_id, author_role, author_id, body) values ($1, 'customer', $2, $3)`,
      [ticket.id, req.user.id, input.message]
    );
    await query(
      `update support_tickets
          set status = case when status = 'resolved' then 'open' else status end,
              updated_at = now(), last_customer_reply_at = now()
        where id = $1`,
      [ticket.id]
    );
    notifyOperators(ticket, `${req.user.full_name} replied to "${ticket.subject}".`);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Write a message first." });
    }
    next(error);
  }
});

export default router;
