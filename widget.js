import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query, one } from "../db.js";
import { buildSystemPrompt, complete, recordAiCost } from "../ai.js";
import { messageAllowanceError, requireActiveAiAccount } from "../plans.js";

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

    const allowance = await messageAllowanceError(assistant.user_id);
    const ownerBlocked = await messageAllowanceError(assistant.user_id);
    if (ownerBlocked) return res.status(429).json({ error: ownerBlocked, code: "MESSAGE_LIMIT" });

    try {
      await requireActiveAiAccount(assistant.user_id);
    } catch (accountError) {
      return res.status(accountError.status || 503).json({ error: accountError.message, code: accountError.code });
    }

    const body = z
      .object({
        message: z.string().trim().min(1, "Type a message first.").max(2000),
        conversationId: z.string().uuid().optional(),
        visitorId: z.string().trim().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional().default(""),
      })
      .parse(req.body);

    let conversation = null;
    if (body.conversationId) {
      conversation = await one(
        `select * from conversations
          where id = $1 and assistant_id = $2 and channel = 'widget'
            and ($3 = '' or visitor_id = '' or visitor_id = $3)`,
        [body.conversationId, assistant.id, body.visitorId]
      );
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    }

    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title, channel, visitor_id)
         values ($1, $2, $3, 'widget', $4)
         returning *`,
        [assistant.user_id, assistant.id, body.message.slice(0, 70), body.visitorId]
      );
    }

    const details = extractDetails(body.message);

    await query(
      "insert into messages (conversation_id, role, content, author) values ($1, 'user', $2, 'visitor')",
      [conversation.id, body.message]
    );
    await query("update conversations set updated_at = now() where id = $1", [conversation.id]);

    if (conversation.takeover) {
      return res.json({ conversationId: conversation.id, reply: "", takeover: true });
    }

    const history = await query(
      `select role, content, author from messages
        where conversation_id = $1
        order by created_at desc
        limit 12`,
      [conversation.id]
    );
    const business = await one("select * from businesses where user_id = $1", [assistant.user_id]);
    const knowledge = await query(
      "select kind, title, content from knowledge_items where assistant_id = $1 order by created_at desc limit 60",
      [assistant.id]
    );

    const system = buildSystemPrompt({ assistant, business, knowledge, channel: "widget" });
    const result = await complete({
      system,
      messages: [
        ...history
          .reverse()
          .filter((row) => row.author !== "team")
          .map((row) => ({ role: row.role, content: row.content })),
      ],
    });

    await query(
      "insert into messages (conversation_id, role, content, author) values ($1, 'assistant', $2, 'ai')",
      [conversation.id, result.text]
    );

    await recordAiCost(assistant.user_id, result.usage);

    const lead = await saveLead(assistant, conversation, details);
    res.json({ conversationId: conversation.id, reply: result.text, leadCaptured: lead });
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

/* Optional "leave your details" form in the widget, for visitors who would
   rather type them once than chat them. */
router.post("/:key/lead", limiter, async (req, res, next) => {
  try {
    const assistant = await assistantByKey(req.params.key);
    if (!assistant) return res.status(404).json({ error: "This chat is not available." });

    const body = z
      .object({
        conversationId: z.string().uuid().optional(),
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
    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title, channel)
         values ($1, $2, $3, 'widget')
         returning *`,
        [assistant.user_id, assistant.id, body.service || "Website enquiry"]
      );
    }

    await saveLead(assistant, conversation, {
      name: body.name,
      email: body.email.toLowerCase(),
      phone: body.phone,
      service: body.service,
    });

    res.status(201).json({
      ok: true,
      conversationId: conversation.id,
      message: "Thank you — your details are with the team.",
    });
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
