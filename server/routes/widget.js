import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query, one } from "../db.js";
import { buildSystemPrompt, complete, recordAiCost } from "../ai.js";
import { loadKnowledgeBase } from "../knowledge.js";
import { messageAllowanceError, requireActiveAiAccount } from "../plans.js";
import { env } from "../env.js";
import {
  sendChatLeadAcknowledgementEmail,
  sendChatLeadEmail,
  sendChatStartedEmail,
} from "../mail.js";

/* Public chatbot endpoints used by the embeddable widget. There is no session
   here: the assistant's public key identifies the business, and a conversation
   id is the only handle on a chat. Everything is scoped by that key so one
   business can never read another's visitors. */
const router = express.Router();

router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "content-type");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a minute and try again." },
});

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/;
const NAME = /\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,40})/i;
const SERVICE = /\b(?:i (?:need|want|would like)|looking for|interested in)\s+([^.!?]{3,120})/i;

/* Visitors describe themselves in ordinary sentences, so the details are read
   out of what they type rather than demanded by a form. */
/* "my name is Musa and I need a website" is a name, not a sentence. */
function cleanName(raw) {
  const value = String(raw || "")
    .split(/[,.;!?]|\s+(?:and|but|from|at|of|who|which)\s+/i)[0]
    .trim();
  return value.split(/\s+/).slice(0, 3).join(" ");
}

function extractDetails(text) {
  const digits = (value) => String(value).replace(/\D/g, "").length;
  const phoneMatch = text.match(PHONE)?.[0]?.trim() || "";
  return {
    name: cleanName(text.match(NAME)?.[1]),
    email: text.match(EMAIL)?.[0]?.trim().toLowerCase() || "",
    phone: digits(phoneMatch) >= 7 ? phoneMatch : "",
    service: text.match(SERVICE)?.[1]?.trim() || "",
  };
}

const publicShape = (row) => ({
  name: row.name,
  businessName: row.business_name || "",
  welcomeMessage:
    row.welcome_message || row.greeting || `Hi! I'm ${row.name}. How can I help you today?`,
  color: row.widget_color || "#0b5cff",
  position: row.widget_position === "left" ? "left" : "right",
  active: Boolean(row.is_active),
});

async function assistantByKey(key) {
  if (!/^[a-z0-9]{16,64}$/i.test(String(key || ""))) return null;
  return one(
    `select a.*, b.name as business_name
       from assistants a
       left join businesses b on b.user_id = a.user_id
      where a.public_key = $1`,
    [key]
  );
}

router.get("/:key", async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });
    res.json({
      assistant: publicShape(assistant),
      ...(assistant.is_active ? {} : { message: "This chat is paused right now." }),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:key/chat", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });
    if (!assistant.is_active) {
      return res.status(409).json({ error: "This chat is paused right now. Please contact the business directly." });
    }

    try {
      await requireActiveAiAccount(assistant.user_id);
    } catch (accountError) {
      return res.status(accountError.status || 503).json({ error: accountError.message, code: accountError.code });
    }

    const body = z
      .object({
        message: z.string().trim().min(1, "Type a message first.").max(2000),
        conversationId: z.string().uuid().optional(),
        /* Stable per-browser identity, so a returning visitor resumes the same
           conversation instead of starting another one. */
        visitorId: z.string().trim().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
        /* Stable id for this one message: the key to safe retries. */
        clientMessageId: z.string().trim().regex(/^[a-zA-Z0-9-]{4,80}$/).optional(),
      })
      .parse(req.body);

    const visitorKey = body.visitorId || "";

    /* A visitor who is already counted this month is never blocked by the
       allowance, even when the limit is otherwise reached. */
    const ownerBlocked = await messageAllowanceError(assistant.user_id, visitorKey);
    if (ownerBlocked) return res.status(429).json({ error: ownerBlocked, code: "MESSAGE_LIMIT" });

    let conversation = null;

    if (body.conversationId) {
      conversation = await one(
        "select * from conversations where id = $1 and assistant_id = $2 and channel = 'widget'",
        [body.conversationId, assistant.id]
      );
      /* An ended conversation is history: it is never continued, a new one starts. */
      if (conversation && conversation.status === "resolved") {
        return res.status(409).json({
          error: "This conversation has ended. Start a new chat to keep talking with us.",
          code: "CONVERSATION_ENDED",
          conversationId: conversation.id,
        });
      }
    }

    /* No usable id (first send, a refreshed page, a second tab, or an id the
       browser no longer has): reuse this visitor's open conversation. */
    if (!conversation && visitorKey) {
      conversation = await one(
        `select * from conversations
          where assistant_id = $1 and visitor_key = $2 and channel = 'widget' and status = 'open'
          order by updated_at desc
          limit 1`,
        [assistant.id, visitorKey]
      );
    }

    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title, channel, visitor_key)
         select $1, $2, $3, 'widget', $4
          where $4 = '' or not exists (
            select 1 from conversations
             where assistant_id = $2 and visitor_key = $4 and channel = 'widget' and status = 'open'
          )
         returning *`,
        [assistant.user_id, assistant.id, body.message.slice(0, 70), visitorKey]
      );
      if (!conversation && visitorKey) {
        conversation = await one(
          `select * from conversations
            where assistant_id = $1 and visitor_key = $2 and channel = 'widget' and status = 'open'
            order by updated_at desc limit 1`,
          [assistant.id, visitorKey]
        );
      }
    }
    if (!conversation) return res.status(503).json({ error: "The chat is busy right now. Please try again." });

    /* Adopt the identity on conversations created before the visitor id existed. */
    if (visitorKey && !conversation.visitor_key) {
      conversation = (await one(
        "update conversations set visitor_key = $2 where id = $1 and visitor_key = '' returning *",
        [conversation.id, visitorKey]
      )) || conversation;
    }

    const details = extractDetails(body.message);

    /* Idempotent storage. A retried send (double click, retry after a dropped
       reply, a slow connection) finds the stored message by its client id
       instead of creating a second one and charging for another AI answer. */
    const clientId = body.clientMessageId || `srv-${conversation.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let replayed = false;
    let userMessage = await one(
      "select * from messages where conversation_id = $1 and client_id = $2",
      [conversation.id, clientId]
    );

    if (userMessage) {
      replayed = true;
    } else {
      try {
        userMessage = await one(
          `insert into messages (conversation_id, role, content, author, client_id, status)
           values ($1, 'user', $2, 'visitor', $3, 'pending')
           on conflict (conversation_id, client_id) do nothing
           returning *`,
          [conversation.id, body.message, clientId]
        );
      } catch (error) {
        if (error.code !== "23505") throw error;
      }
      if (!userMessage) {
        userMessage = await one(
          "select * from messages where conversation_id = $1 and client_id = $2",
          [conversation.id, clientId]
        );
        replayed = true;
      }
      await query("update conversations set updated_at = now() where id = $1", [conversation.id]);
    }

    if (!userMessage) {
      return res.status(500).json({ error: "We could not save that message. Please try again." });
    }

    const replyFor = (value = "") => ({
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: value?.id || null,
      reply: value?.content ?? "",
      replayed,
      takeover: Boolean(conversation.takeover),
    });

    const existingReply = await one(
      "select * from messages where conversation_id = $1 and reply_to = $2",
      [conversation.id, userMessage.id]
    );
    if (existingReply) {
      return res.json({
        ...replyFor(existingReply),
        conversationId: conversation.id,
        reply: existingReply.content,
        takeover: false,
        leadCaptured: false,
        leadAlerted: false,
        chatEmailed: false,
        confirmationSent: false,
      });
    }

    /* The visitor's message is saved, so tell the business and capture the lead
       now — before the assistant is called. A rate-limited or unavailable AI
       no longer swallows the enquiry. */
    let leadCaptured = false;
    let notification = { alerted: false, acknowledged: false };
    if (!replayed) {
      try {
        leadCaptured = await saveLead(assistant, conversation, details);
        notification = leadCaptured
          ? await notifyLead(assistant, conversation)
          : { alerted: false, acknowledged: false };
        if (await notifyChatStarted(assistant, conversation)) {
          conversation.notified_at = new Date().toISOString();
        }
      } catch (error) {
        console.error(`[widget] notification failed for ${conversation.id} — ${error.message}`);
      }
    }

    if (conversation.takeover) {
      await query("update messages set status = 'done' where id = $1", [userMessage.id]);
      return res.json({ ...replyFor(), takeover: true });
    }

    /* A retry may arrive while the first request is still producing the answer.
       Wait for that answer rather than generating a second one. */
    if (replayed) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const late = await one(
          "select * from messages where conversation_id = $1 and reply_to = $2",
          [conversation.id, userMessage.id]
        );
        if (late) {
          return res.json({
            ...replyFor(late),
            reply: late.content,
            takeover: false,
            leadCaptured: false,
            leadAlerted: false,
            chatEmailed: false,
            confirmationSent: false,
          });
        }
        const current = await one("select status from messages where id = $1", [userMessage.id]);
        if (current && (current.status === "failed" || current.status === "done")) break;
      }
      const settled = await one("select status from messages where id = $1", [userMessage.id]);
      if (settled && settled.status === "done") {
        return res.json({ ...replyFor(), takeover: Boolean(conversation.takeover) });
      }
      if (!settled || settled.status !== "failed") {
        return res.status(202).json({ ...replyFor(), pending: true });
      }
    }

    const history = await query(
      `select role, content, author from messages
        where conversation_id = $1 and status <> 'failed'
        order by created_at desc
        limit 12`,
      [conversation.id]
    );
    /* The business profile, products, FAQs and the relevant passages of any
       uploaded documents, all loaded for this assistant's owner only. */
    const context = await loadKnowledgeBase(assistant.user_id, {
      assistantId: assistant.id,
      question: body.message,
    });

    const system = buildSystemPrompt({
      assistant,
      business: context.business,
      knowledge: context.knowledge,
      businessContext: context.businessContext,
      channel: "widget",
    });

    await query("update messages set status = 'processing' where id = $1", [userMessage.id]);

    let result;
    try {
      result = await complete({
        system,
        messages: [
          ...history
            .reverse()
            .filter((row) => row.author !== "team")
            .map((row) => ({ role: row.role, content: row.content })),
        ],
      });
    } catch (error) {
      /* The visitor's message is stored and marked failed, so a retry with the
         same client id can try again without creating a duplicate. */
      await query("update messages set status = 'failed' where id = $1", [userMessage.id]);
      /* Both failures happen after the visitor's message is stored, so the ids
         go back with the error: the widget then keeps the chat in history
         instead of treating it as a message that never arrived. */
      if (error?.code === "AI_UNAVAILABLE" || error?.code === "AI_NOT_CONFIGURED") {
        return res.status(error.status || 502).json({
          error: error.message,
          code: error.code,
          conversationId: conversation.id,
          userMessageId: userMessage.id,
        });
      }
      throw error;
    }

    /* reply_to keeps one assistant answer per visitor message, even if two
       requests race. Only the request that actually stored the answer pays. */
    let assistantMessage = await one(
      `insert into messages (conversation_id, role, content, author, reply_to)
       values ($1, 'assistant', $2, 'ai', $3)
       on conflict (conversation_id, reply_to) do nothing
       returning id, content`,
      [conversation.id, result.text, userMessage.id]
    );

    if (assistantMessage) {
      await recordAiCost(assistant.user_id, result.usage);
    } else {
      assistantMessage = await one(
        "select id, content from messages where conversation_id = $1 and reply_to = $2",
        [conversation.id, userMessage.id]
      );
    }

    await query("update messages set status = 'done' where id = $1", [userMessage.id]);

    /* The business was already told about this message above, so this call only
       reports whether the notification actually went out. */
    res.json({
      ...replyFor(assistantMessage),
      reply: assistantMessage?.content || result.text,
      leadCaptured,
      leadAlerted: notification.alerted,
      chatEmailed: notification.alerted || Boolean(conversation.notified_at),
      confirmationSent: notification.acknowledged,
    });
  } catch (error) {
    next(error);
  }
});

async function saveLead(assistant, conversation, details) {
  const found = [details.name, details.email, details.phone, details.service].filter(Boolean);
  if (!found.length) return false;

  await query(
    `update conversations
        set visitor_name = coalesce(nullif($2, ''), visitor_name),
            visitor_email = coalesce(nullif($3, ''), visitor_email),
            visitor_phone = coalesce(nullif($4, ''), visitor_phone),
            visitor_service = coalesce(nullif($5, ''), visitor_service),
            updated_at = now()
      where id = $1`,
    [conversation.id, details.name, details.email, details.phone, details.service]
  );

  await query(
    `insert into leads (user_id, assistant_id, conversation_id, name, email, phone, service, source)
     values ($1, $2, $3, $4, $5, $6, $7, 'website')
     on conflict (conversation_id) do update
        set name = coalesce(nullif(excluded.name, ''), leads.name),
            email = coalesce(nullif(excluded.email, ''), leads.email),
            phone = coalesce(nullif(excluded.phone, ''), leads.phone),
            service = coalesce(nullif(excluded.service, ''), leads.service),
            updated_at = now()`,
    [
      assistant.user_id,
      assistant.id,
      conversation.id,
      details.name,
      details.email,
      details.phone,
      details.service,
    ]
  );
  return true;
}

/* The chat collected a visitor's details: alert the assistant owner at their
   main email address and confirm to the visitor that the message arrived.
   Both emails are sent once per lead, and a mail failure never breaks the chat. */
/* Who receives chat notifications: the business support address, then the
   owner's account email, then the platform inbox as a last resort. */
async function ownerRecipients(assistant) {
  const owner = await one(
    `select u.email, u.full_name, b.name as business_name, b.support_email
       from users u
       left join businesses b on b.user_id = u.id
      where u.id = $1`,
    [assistant.user_id]
  );
  const primary = String(owner?.support_email || owner?.email || "").trim();
  const fallback = String(env.projectEnquiryEmail || "").trim();
  const to = primary || fallback;
  return {
    to: to ? [to] : [],
    businessName: owner?.business_name || owner?.full_name || "",
  };
}

async function transcriptFor(conversationId) {
  const messages = await query(
    `select role, author, content from messages
      where conversation_id = $1
      order by created_at asc
      limit 20`,
    [conversationId]
  );
  return messages
    .map((row) => {
      const who = row.author === "team" ? "Team" : row.role === "user" ? "Visitor" : "Assistant";
      return `${who}: ${row.content}`;
    })
    .join("\n")
    .slice(0, 4000);
}

/* First message of a conversation: email the owner even without contact
   details, so a chat never exists only inside the dashboard. */
async function notifyChatStarted(assistant, conversation) {
  try {
    if (conversation.notified_at) return false;
    const { to, businessName } = await ownerRecipients(assistant);
    if (!to.length) return false;

    const transcript = await transcriptFor(conversation.id);
    const reference = `CHAT-${String(conversation.id).slice(0, 8).toUpperCase()}`;
    const sent = await sendChatStartedEmail(
      {
        assistantName: assistant.name,
        businessName,
        reference,
        visitor: {
          name: conversation.visitor_name || "",
          email: conversation.visitor_email || "",
          phone: conversation.visitor_phone || "",
        },
        transcript,
      },
      to
    );

    await query(
      `update conversations
          set notified_at = now(),
              notification_status = $2,
              notification_error = $3
        where id = $1`,
      [
        conversation.id,
        sent?.delivered ? "sent" : "failed",
        sent?.delivered ? "" : String((sent?.failures || []).join(" | ")).slice(0, 500),
      ]
    );
    return Boolean(sent?.delivered);
  } catch (error) {
    console.error(`[widget] chat notification failed for ${conversation.id} — ${error.message}`);
    return false;
  }
}

async function notifyLead(assistant, conversation) {
  const result = { alerted: false, acknowledged: false };
  try {
    const lead = await one("select * from leads where conversation_id = $1", [conversation.id]);
    if (!lead || (!lead.email && !lead.phone)) return result;

    const { to, businessName } = await ownerRecipients(assistant);
    if (!to.length) return result;

    const transcript = await transcriptFor(conversation.id);

    if (!lead.notified_at) {
      const sent = await sendChatLeadEmail(
        { lead, assistantName: assistant.name, businessName, transcript },
        to
      );
      result.alerted = Boolean(sent?.delivered);
      await query(
        `update leads
            set notified_at = now(),
                notification_status = $2,
                notification_error = $3,
                updated_at = now()
          where id = $1`,
        [
          lead.id,
          sent?.delivered ? "sent" : "failed",
          sent?.delivered ? "" : String((sent?.failures || []).join(" | ")).slice(0, 500),
        ]
      );
    }

    if (!lead.acknowledged_at && lead.email) {
      const sent = await sendChatLeadAcknowledgementEmail(
        { lead, assistantName: assistant.name, businessName, transcript },
        lead.email
      );
      result.acknowledged = Boolean(sent?.delivered);
      if (sent?.delivered) {
        await query("update leads set acknowledged_at = now(), updated_at = now() where id = $1", [lead.id]);
      }
    }
  } catch (error) {
    console.error(`[widget] lead notification failed for conversation ${conversation.id} — ${error.message}`);
  }
  return result;
}

/* Optional "leave your details" form in the widget, for visitors who would
   rather type them once than chat them. */
router.post("/:key/lead", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });

    const body = z
      .object({
        conversationId: z.string().uuid().optional(),
        visitorId: z.string().trim().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
        name: z.string().trim().max(120).optional().default(""),
        email: z.string().trim().max(254).optional().default(""),
        phone: z.string().trim().max(40).optional().default(""),
        service: z.string().trim().max(300).optional().default(""),
      })
      .parse(req.body);

    if (!body.email && !body.phone) {
      return res.status(400).json({ error: "Add an email address or a phone number so the team can reply." });
    }
    if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      return res.status(400).json({ error: "That email address does not look right." });
    }

    let conversation = null;
    if (body.conversationId) {
      conversation = await one(
        "select * from conversations where id = $1 and assistant_id = $2 and channel = 'widget'",
        [body.conversationId, assistant.id]
      );
    }
    /* Details submitted without an id belong to this visitor's open chat, if
       they have one — never to a brand-new duplicate conversation. */
    if (!conversation && body.visitorId) {
      conversation = await one(
        `select * from conversations
          where assistant_id = $1 and visitor_key = $2 and channel = 'widget' and status = 'open'
          order by updated_at desc limit 1`,
        [assistant.id, body.visitorId]
      );
    }
    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title, channel, visitor_key)
         values ($1, $2, $3, 'widget', $4)
         returning *`,
        [assistant.user_id, assistant.id, body.service || "Website enquiry", body.visitorId || ""]
      );
    }

    await saveLead(assistant, conversation, {
      name: body.name,
      email: body.email.toLowerCase(),
      phone: body.phone,
      service: body.service,
    });
    const notified = await notifyLead(assistant, conversation);

    res.status(201).json({
      ok: true,
      conversationId: conversation.id,
      confirmationSent: notified.acknowledged,
      message: notified.acknowledged
        ? "Thank you — your details are with the team and a confirmation is on its way to your inbox."
        : "Thank you — your details are with the team.",
    });
  } catch (error) {
    next(error);
  }
});

/* Everything this visitor has said to this assistant, so "Previous chats" is
   available after a refresh, in another tab, or on a return visit — not only
   in the tab where the chat was ended. */
router.get("/:key/visitor/:visitorId/conversations", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(String(req.params.visitorId || ""))) {
      return res.json({ open: null, conversations: [] });
    }

    const rows = await query(
      `select c.id, c.title, c.status, c.created_at, c.updated_at,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
              (select m.content from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
         from conversations c
        where c.assistant_id = $1 and c.visitor_key = $2 and c.channel = 'widget'
        order by c.updated_at desc
        limit 10`,
      [assistant.id, req.params.visitorId]
    );

    const open = rows.find((row) => row.status === "open");
    res.json({
      open: open ? { id: open.id, status: open.status } : null,
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        messageCount: row.message_count,
        lastMessage: String(row.last_message || "").slice(0, 120),
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* The visitor can end the conversation themselves. It is kept in the dashboard
   as resolved history; the visitor then starts a fresh conversation. */
router.post("/:key/conversation/:id/end", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });

    const conversation = await one(
      "select * from conversations where id = $1 and assistant_id = $2 and channel = 'widget'",
      [req.params.id, assistant.id]
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    await query(
      "update conversations set status = 'resolved', updated_at = now() where id = $1",
      [conversation.id]
    );

    res.json({ ok: true, status: "resolved" });
  } catch (error) {
    next(error);
  }
});

/* The widget polls this so a conversation taken over by a person shows the
   team's replies instead of waiting for the AI. */
router.get("/:key/conversation/:id", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });

    const conversation = await one(
      "select * from conversations where id = $1 and assistant_id = $2 and channel = 'widget'",
      [req.params.id, assistant.id]
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });

    const messages = await query(
      "select id, role, author, content, created_at from messages where conversation_id = $1 order by created_at asc limit 200",
      [conversation.id]
    );

    res.json({
      conversationId: conversation.id,
      takeover: Boolean(conversation.takeover),
      status: conversation.status,
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        author: row.author,
        content: row.content,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
