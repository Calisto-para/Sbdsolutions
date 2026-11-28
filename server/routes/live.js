import express from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import {
  STATUS,
  addSystemMessage,
  broadcastMessage,
  broadcastStatus,
  findOwnedConversation,
  normalizeStatus,
  shapeMessage,
  statusLabel,
} from "../livechat.js";
import { subscribeOwner } from "../realtime.js";

/* Live Chat inbox. Every query is scoped to req.user.id, so one business can
   never read, reply to or change another business's conversations. */
const router = express.Router();

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a minute and try again." },
});

router.use(requireAuth);

const FILTERS = {
  all: "",
  ai: `and c.status in ('ai_active', 'open')`,
  requested: `and c.status = 'human_requested'`,
  human: `and c.status = 'human_active'`,
  resolved: `and c.status = 'resolved'`,
  unread: `and exists (
    select 1 from messages m
     where m.conversation_id = c.id and m.role = 'user'
       and m.created_at > c.owner_last_read_at
  )`,
};

const summaryShape = (row) => ({
  id: row.id,
  title: row.title,
  assistantId: row.assistant_id,
  assistantName: row.assistant_name,
  channel: row.channel,
  status: normalizeStatus(row.status),
  statusLabel: statusLabel(row.status),
  takeover: normalizeStatus(row.status) === STATUS.HUMAN,
  visitorName: row.visitor_name || "",
  visitorEmail: row.visitor_email || "",
  visitorPhone: row.visitor_phone || "",
  lastMessage: row.last_message || "",
  messageCount: Number(row.message_count || 0),
  unread: Number(row.unread || 0),
  assignedTo: row.human_assigned_to || null,
  requestedAt: row.human_requested_at || null,
  updatedAt: row.last_message_at || row.updated_at,
});

router.get("/summary", async (req, res, next) => {
  try {
    const row = await one(
      `select
         count(*)::int as total,
         count(*) filter (where status in ('ai_active', 'open'))::int as ai,
         count(*) filter (where status = 'human_requested')::int as requested,
         count(*) filter (where status = 'human_active')::int as human,
         count(*) filter (where status = 'resolved')::int as resolved
       from conversations where user_id = $1`,
      [req.user.id]
    );
    const unread = await one(
      `select count(*)::int as count
         from conversations c
        where c.user_id = $1
          and exists (select 1 from messages m
                       where m.conversation_id = c.id and m.role = 'user'
                         and m.created_at > c.owner_last_read_at)`,
      [req.user.id]
    );
    res.json({
      counts: {
        all: Number(row?.total || 0),
        ai: Number(row?.ai || 0),
        requested: Number(row?.requested || 0),
        human: Number(row?.human || 0),
        resolved: Number(row?.resolved || 0),
        unread: Number(unread?.count || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    const filter = FILTERS[String(req.query.filter || "all")] ?? FILTERS.all;
    const q = `%${String(req.query.q || "").trim().replace(/[%_]/g, "")}%`;
    const rows = await query(
      `select c.*, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
              (select m.content from messages m where m.conversation_id = c.id
                order by m.created_at desc limit 1) as last_message,
              (select count(*)::int from messages m
                where m.conversation_id = c.id and m.role = 'user'
                  and m.created_at > c.owner_last_read_at) as unread
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
          and ($2 = '%%' or c.title ilike $2 or c.visitor_name ilike $2
               or c.visitor_email ilike $2 or c.visitor_phone ilike $2
               or exists (select 1 from messages m where m.conversation_id = c.id and m.content ilike $2))
          ${filter}
        order by
          case when c.status = 'human_requested' then 0
               when c.status = 'human_active' then 1 else 2 end,
          coalesce(c.last_message_at, c.updated_at) desc
        limit 200`,
      [req.user.id, q]
    );
    res.json({ conversations: rows.map(summaryShape) });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations/:id", async (req, res, next) => {
  try {
    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const [messages, assistant, lead, operator] = await Promise.all([
      query(
        `select id, role, author, content, client_id, status, created_at
           from messages where conversation_id = $1
          order by created_at asc limit 500`,
        [conversation.id]
      ),
      one("select id, name from assistants where id = $1", [conversation.assistant_id]),
      one("select * from leads where conversation_id = $1", [conversation.id]),
      conversation.human_assigned_to
        ? one("select id, full_name, email from users where id = $1", [conversation.human_assigned_to])
        : Promise.resolve(null),
    ]);

    /* Opening the thread clears its unread badge for this owner only. */
    await query(
      "update conversations set owner_last_read_at = now() where id = $1 and user_id = $2",
      [conversation.id, req.user.id]
    );

    res.json({
      conversation: {
        ...summaryShape({ ...conversation, assistant_name: assistant?.name || "Assistant" }),
        visitor: {
          name: conversation.visitor_name || "",
          email: conversation.visitor_email || "",
          phone: conversation.visitor_phone || "",
          service: conversation.visitor_service || "",
          id: conversation.visitor_key || "",
        },
        assignedOperator: operator ? { id: operator.id, name: operator.full_name } : null,
        createdAt: conversation.created_at,
        resolvedAt: conversation.resolved_at || null,
      },
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            service: lead.service,
            status: lead.status,
            createdAt: lead.created_at,
          }
        : null,
      messages: messages.map(shapeMessage),
    });
  } catch (error) {
    next(error);
  }
});

/* Take over: the AI stops for this conversation and this operator is recorded
   as the person handling it. */
router.post("/conversations/:id/takeover", async (req, res, next) => {
  try {
    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (normalizeStatus(conversation.status) === STATUS.RESOLVED) {
      return res.status(409).json({ error: "This conversation is resolved. Reopen it before taking over." });
    }

    const row = await one(
      `update conversations
          set status = 'human_active',
              takeover = true,
              human_assigned_to = $3,
              human_assigned_at = now(),
              owner_last_read_at = now(),
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [conversation.id, req.user.id, req.user.id]
    );

    await addSystemMessage(
      conversation.id,
      "A member of our team has joined this chat — replies now come from the team."
    );
    broadcastStatus(row);

    res.json({
      conversation: summaryShape(row),
      message: "You have taken over this conversation. Your replies appear to the visitor.",
    });
  } catch (error) {
    next(error);
  }
});

/* Return control to the assistant. The whole transcript stays, and the next
   visitor message is answered by the AI exactly once. */
router.post("/conversations/:id/return", async (req, res, next) => {
  try {
    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (normalizeStatus(conversation.status) === STATUS.RESOLVED) {
      return res.status(409).json({ error: "This conversation is resolved. Reopen it before returning it to the assistant." });
    }

    const row = await one(
      `update conversations
          set status = 'ai_active',
              takeover = false,
              human_assigned_to = null,
              human_assigned_at = null,
              human_requested_at = null,
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [conversation.id, req.user.id]
    );

    await addSystemMessage(conversation.id, "The AI assistant is back and can help from here.");
    broadcastStatus(row);

    res.json({
      conversation: summaryShape(row),
      message: "The AI assistant is handling this conversation again.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/conversations/:id/resolve", async (req, res, next) => {
  try {
    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const row = await one(
      `update conversations
          set status = 'resolved',
              takeover = false,
              human_assigned_to = null,
              resolved_at = now(),
              owner_last_read_at = now(),
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [conversation.id, req.user.id]
    );
    await addSystemMessage(conversation.id, "This conversation has been marked as resolved.");
    broadcastStatus(row);
    res.json({ conversation: summaryShape(row), message: "Conversation marked as resolved." });
  } catch (error) {
    next(error);
  }
});

router.post("/conversations/:id/reopen", async (req, res, next) => {
  try {
    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const row = await one(
      `update conversations
          set status = 'ai_active', resolved_at = null, takeover = false, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [conversation.id, req.user.id]
    );
    broadcastStatus(row);
    res.json({ conversation: summaryShape(row), message: "Conversation reopened." });
  } catch (error) {
    next(error);
  }
});

/* A human reply. It is stored as an assistant message with author 'team', so
   the AI never bills for it and the visitor's widget renders it as the team. */
router.post("/conversations/:id/messages", sendLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        message: z.string().trim().min(1, "Type a reply first.").max(4000),
        clientId: z.string().trim().regex(/^[a-zA-Z0-9-]{4,80}$/).optional(),
      })
      .parse(req.body);

    const conversation = await findOwnedConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (normalizeStatus(conversation.status) === STATUS.RESOLVED) {
      return res.status(409).json({ error: "This conversation is resolved. Reopen it to reply." });
    }

    /* Replying implies taking the chat over, so AI and human can never answer
       the same message at the same time. */
    let current = conversation;
    if (normalizeStatus(current.status) !== STATUS.HUMAN) {
      current = await one(
        `update conversations
            set status = 'human_active', takeover = true, human_assigned_to = $3,
                human_assigned_at = coalesce(human_assigned_at, now()), updated_at = now()
          where id = $1 and user_id = $2
          returning *`,
        [conversation.id, req.user.id, req.user.id]
      );
      broadcastStatus(current);
    }

    const clientId = body.clientId || `team-${req.user.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let row = await one(
      "select * from messages where conversation_id = $1 and client_id = $2",
      [conversation.id, clientId]
    );
    let duplicate = Boolean(row);
    if (!row) {
      row = await one(
        `insert into messages (conversation_id, role, content, author, client_id, status)
         values ($1, 'assistant', $2, 'team', $3, 'done')
         on conflict (conversation_id, client_id) do nothing
         returning *`,
        [conversation.id, body.message, clientId]
      );
      if (!row) {
        row = await one("select * from messages where conversation_id = $1 and client_id = $2", [
          conversation.id,
          clientId,
        ]);
        duplicate = true;
      }
    }

    await query(
      `update conversations
          set last_message_at = now(), owner_last_read_at = now(), updated_at = now()
        where id = $1`,
      [conversation.id]
    );

    if (!duplicate) broadcastMessage(current, row);

    res.status(duplicate ? 200 : 201).json({
      message: shapeMessage(row),
      conversation: summaryShape(current),
      duplicate,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/conversations/:id/read", async (req, res, next) => {
  try {
    const row = await one(
      `update conversations set owner_last_read_at = now()
        where id = $1 and user_id = $2 returning id`,
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "Conversation not found." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* Server-sent events: one stream per signed-in owner. EventSource sends the
   session cookie, and requireAuth has already resolved the account. */
router.get("/stream", (req, res) => {
  subscribeOwner(req, res, req.user.id);
});

export default router;
