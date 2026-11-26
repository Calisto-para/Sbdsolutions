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
      })
      .parse(req.body);

    let conversation = null;
    if (body.conversationId) {
      conversation = await one(
        "select * from conversations where id = $1 and assistant_id = $2 and channel = 'widget'",
        [body.conversationId, assistant.id]
      );
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
      /* An ended conversation is history: it is never continued, a new one starts. */
      if (conversation.status === "resolved") {
        return res.status(409).json({
          error: "This conversation has ended. Start a new chat to keep talking with us.",
          code: "CONVERSATION_ENDED",
        });
      }
    }

    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title, channel)
         values ($1, $2, $3, 'widget')
         returning *`,
        [assistant.user_id, assistant.id, body.message.slice(0, 70)]
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
      /* The visitor's message is already stored, so hand back the conversation
         id: the widget adopts it and can retry without sending twice. */
      if (error?.code === "AI_UNAVAILABLE") {
        return res.status(502).json({
          error: error.message,
          code: error.code,
          conversationId: conversation.id,
        });
      }
      throw error;
    }

    const assistantMessage = await one(
      "insert into messages (conversation_id, role, content, author) values ($1, 'assistant', $2, 'ai') returning id",
      [conversation.id, result.text]
    );

    await recordAiCost(assistant.user_id, result.usage);

    const lead = await saveLead(assistant, conversation, details);
    const notified = lead ? await notifyLead(assistant, conversation) : { alerted: false, acknowledged: false };
    /* A lead alert already carries this conversation; otherwise email the owner
       on the first message so nothing lives only in the dashboard. */
    const started = notified.alerted ? true : await notifyChatStarted(assistant, conversation);
    res.json({
      conversationId: conversation.id,
      assistantMessageId: assistantMessage?.id || null,
      reply: result.text,
      leadCaptured: lead,
      leadAlerted: notified.alerted,
      chatEmailed: started,
      confirmationSent: notified.acknowledged,
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
