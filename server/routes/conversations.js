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
  /* 'open' is the pre-lifecycle spelling of ai_active. */
  status: row.status === "open" || !row.status ? "ai_active" : row.status,
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
    const requested = String(req.query.status || "");
    const status =
      requested === "open"
        ? "ai_active"
        : ["ai_active", "human_requested", "human_active", "resolved", "open"].includes(requested)
          ? requested
          : "";
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
          and ($3 = '' or c.status = $3 or ($3 = 'ai_active' and c.status = 'open'))
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
        status: conversation.status === "open" ? "ai_active" : conversation.status,
        takeover: Boolean(conversation.takeover),
        assignedTo: conversation.human_assigned_to || null,
        humanRequestedAt: conversation.human_requested_at || null,
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
        status: z
          .enum(["open", "ai_active", "human_requested", "human_active", "resolved"])
          .optional(),
        takeover: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await one("select * from conversations where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!existing) return res.status(404).json({ error: "Conversation not found." });

    /* The status and the takeover flag are kept consistent: taking over means
       human_active, returning to the assistant means ai_active, and a resolve
       clears the assignment. */
    const nextStatus =
      body.takeover === true
        ? "human_active"
        : body.takeover === false
          ? "ai_active"
          : body.status === "open"
            ? "ai_active"
            : body.status ?? null;

    const row = await one(
      `update conversations
          set status = coalesce($3, status),
              takeover = coalesce($4, takeover),
              human_assigned_to = case
                when $3 = 'human_active' then $2::uuid
                when $3 in ('ai_active', 'resolved') then null
                else human_assigned_to end,
              human_requested_at = case when $3 = 'ai_active' then null else human_requested_at end,
              resolved_at = case when $3 = 'resolved' then now() when $3 = 'ai_active' then null else resolved_at end,
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [req.params.id, req.user.id, nextStatus, body.takeover ?? null]
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
      "insert into messages (conversation_id, role, content, author, status) values ($1, 'assistant', $2, 'team', 'done') returning *",
      [conversation.id, message]
    );
    await query(
      `update conversations
          set takeover = true, status = 'human_active',
              human_assigned_to = coalesce(human_assigned_to, $2::uuid),
              last_message_at = now(), updated_at = now()
        where id = $1`,
      [conversation.id, req.user.id]
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
