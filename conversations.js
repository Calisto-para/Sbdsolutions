import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";

const router = express.Router();

const searchTerm = (value) => `%${String(value || "").trim().replace(/[%_]/g, "")}%`;

const toSummary = (row) => ({
  id: row.id,
  title: row.title,
  assistantId: row.assistant_id,
  assistantName: row.assistant_name,
  channel: row.channel,
  status: row.status,
  takeover: Boolean(row.takeover),
  messageCount: row.message_count,
  lastMessage: row.last_message,
  visitorName: row.visitor_name,
  visitorEmail: row.visitor_email,
  updatedAt: row.updated_at,
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const status = ["open", "resolved"].includes(String(req.query.status)) ? String(req.query.status) : "";
    const assistantId = z.string().uuid().safeParse(req.query.assistantId).success ? req.query.assistantId : "";

    const rows = await query(
      `select c.*, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
              (select m.content from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
          and ($2 = '%%'
               or c.title ilike $2
               or c.visitor_name ilike $2
               or c.visitor_email ilike $2
               or c.visitor_phone ilike $2
               or exists (select 1 from messages m where m.conversation_id = c.id and m.content ilike $2))
          and ($3 = '' or c.status = $3)
          and ($4 = '' or c.assistant_id = $4::uuid)
        order by c.updated_at desc
        limit 200`,
      [req.user.id, q, status, assistantId]
    );

    res.json({ conversations: rows.map(toSummary) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const conversation = await one("select * from conversations where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const [messages, assistant, lead] = await Promise.all([
      query(
        "select id, role, author, content, created_at from messages where conversation_id = $1 order by created_at asc limit 500",
        [conversation.id]
      ),
      one("select id, name from assistants where id = $1", [conversation.assistant_id]),
      one("select * from leads where conversation_id = $1", [conversation.id]),
    ]);

    res.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        assistantId: conversation.assistant_id,
        assistantName: assistant?.name || "Assistant",
        channel: conversation.channel,
        status: conversation.status,
        takeover: Boolean(conversation.takeover),
        visitor: {
          name: conversation.visitor_name,
          email: conversation.visitor_email,
          phone: conversation.visitor_phone,
          service: conversation.visitor_service,
        },
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      },
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            service: lead.service,
            createdAt: lead.created_at,
          }
        : null,
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        author: row.author || (row.role === "user" ? "visitor" : "ai"),
        content: row.content,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* Resolve, reopen, or take the conversation over from the assistant. */
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["open", "resolved"]).optional(),
        takeover: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await one("select * from conversations where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!existing) return res.status(404).json({ error: "Conversation not found." });

    const row = await one(
      `update conversations
          set status = coalesce($3, status),
              takeover = coalesce($4, takeover),
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [req.params.id, req.user.id, body.status ?? null, body.takeover ?? null]
    );

    res.json({
      conversation: {
        id: row.id,
        title: row.title,
        status: row.status,
        takeover: Boolean(row.takeover),
      },
      message: body.takeover === true
        ? "You have taken over this conversation. Your replies appear to the visitor."
        : body.takeover === false
          ? "The assistant is handling this conversation again."
          : body.status === "resolved"
            ? "Conversation marked as resolved."
            : "Conversation reopened.",
    });
  } catch (error) {
    next(error);
  }
});

/* A person replying to the visitor. Answering implies taking the chat over. */
router.post("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const { message } = z
      .object({ message: z.string().trim().min(1, "Type a reply first.").max(4000) })
      .parse(req.body);

    const conversation = await one("select * from conversations where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const row = await one(
      "insert into messages (conversation_id, role, content, author) values ($1, 'assistant', $2, 'team') returning *",
      [conversation.id, message]
    );
    await query(
      "update conversations set takeover = true, status = 'open', updated_at = now() where id = $1",
      [conversation.id]
    );

    res.status(201).json({
      message: {
        id: row.id,
        role: row.role,
        author: row.author,
        content: row.content,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const conversation = await one("select id from conversations where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    await query("delete from conversations where id = $1 and user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
