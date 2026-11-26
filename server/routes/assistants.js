import express from "express";
import multer from "multer";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildSystemPrompt, complete, recordAiCost } from "../ai.js";
import { loadKnowledgeBase } from "../knowledge.js";
import {
  agentUsage,
  assistantAllowanceError,
  checkTokenLimit,
  addTokenUsage,
  requireActiveAiAccount,
} from "../plans.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TONES = ["friendly", "professional", "concise", "formal"];

const toApi = (row) => ({
  id: row.id,
  name: row.name,
  businessDescription: row.business_description,
  services: row.services,
  products: row.products,
  tone: row.tone,
  language: row.language,
  greeting: row.greeting,
  instructions: row.instructions,
  isActive: row.is_active,
  publicKey: row.public_key,
  widgetColor: row.widget_color,
  widgetPosition: row.widget_position,
  welcomeMessage: row.welcome_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const knowledgeApi = (row) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  content: row.content,
  sourceName: row.source_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assistantShape = {
  name: z.string().trim().min(2, "Give the assistant a name.").max(120),
  businessDescription: z.string().trim().max(2000).optional().default(""),
  services: z.string().trim().max(4000).optional().default(""),
  products: z.string().trim().max(4000).optional().default(""),
  tone: z.enum(TONES).optional().default("friendly"),
  language: z.string().trim().max(60).optional().default("English"),
  greeting: z.string().trim().max(600).optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  isActive: z.boolean().optional().default(true),
  widgetColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Choose a colour such as #0b5cff.")
    .optional()
    .default("#0b5cff"),
  widgetPosition: z.enum(["right", "left"]).optional().default("right"),
  welcomeMessage: z.string().trim().max(600).optional().default(""),
};

async function ownedAssistant(userId, assistantId) {
  if (!/^[0-9a-f-]{36}$/i.test(assistantId)) return null;
  return one("select * from assistants where id = $1 and user_id = $2", [assistantId, userId]);
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `select a.*,
              (select count(*)::int from knowledge_items k where k.assistant_id = a.id) as knowledge_count,
              (select count(*)::int from conversations c where c.assistant_id = a.id) as conversation_count
         from assistants a
        where a.user_id = $1
        order by a.created_at desc`,
      [req.user.id]
    );
    res.json({
      assistants: rows.map((row) => ({
        ...toApi(row),
        knowledgeCount: row.knowledge_count,
        conversationCount: row.conversation_count,
      })),
      limits: await agentUsage(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const allowance = await assistantAllowanceError(req.user.id);
    if (allowance) return res.status(403).json({ error: allowance, code: "PLAN_LIMIT" });

    const body = z.object(assistantShape).parse(req.body);
    const { limit } = await agentUsage(req.user.id);
    const row = await one(
      `insert into assistants
        (user_id, name, business_description, services, products, tone, language, greeting,
         instructions, is_active, widget_color, widget_position, welcome_message)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning *`,
      [
        req.user.id,
        body.name,
        body.businessDescription,
        body.services,
        body.products,
        body.tone,
        body.language,
        body.greeting || `Hi! I'm ${body.name}. How can I help you today?`,
        body.instructions,
        body.isActive,
        body.widgetColor,
        body.widgetPosition,
        body.welcomeMessage,
      ]
    );
    /* Two clicks can arrive together, both passing the check above. Keep the
       oldest agents allowed by the plan and drop this one if it is over the
       limit, so the account never exceeds its allowance. */
    const rank = await one(
      `select count(*)::int as placed from assistants
        where user_id = $1
          and (created_at < $2 or (created_at = $2 and id <= $3))`,
      [req.user.id, row.created_at, row.id]
    );
    if (limit <= 0 || Number(rank?.placed || 0) > limit) {
      await query("delete from assistants where id = $1 and user_id = $2", [row.id, req.user.id]);
      return res.status(403).json({
        error: await assistantAllowanceError(req.user.id),
        code: "PLAN_LIMIT",
      });
    }

    res.status(201).json({
      assistant: toApi(row),
      limits: await agentUsage(req.user.id),
      message: "Assistant created.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const row = await ownedAssistant(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ error: "Assistant not found." });
    res.json({ assistant: toApi(row) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await ownedAssistant(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ error: "Assistant not found." });

    const body = z.object(assistantShape).parse({ ...toApi(existing), ...req.body });
    const row = await one(
      `update assistants
          set name = $3, business_description = $4, services = $5, products = $6,
              tone = $7, language = $8, greeting = $9, instructions = $10, is_active = $11,
              widget_color = $12, widget_position = $13, welcome_message = $14, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [
        req.params.id,
        req.user.id,
        body.name,
        body.businessDescription,
        body.services,
        body.products,
        body.tone,
        body.language,
        body.greeting,
        body.instructions,
        body.isActive,
        body.widgetColor,
        body.widgetPosition,
        body.welcomeMessage,
      ]
    );
    res.json({ assistant: toApi(row), message: "Assistant updated." });
  } catch (error) {
    next(error);
  }
});

/* A new key invalidates the old snippet, for a business that moved the chat to
   a new site or wants to switch the old install off. */
router.post("/:id/widget-key", requireAuth, async (req, res, next) => {
  try {
    const row = await one(
      `update assistants
          set public_key = replace(gen_random_uuid()::text, '-', ''), updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "Assistant not found." });
    res.json({ assistant: toApi(row), message: "A new installation code was generated. The old code no longer works." });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await ownedAssistant(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ error: "Assistant not found." });
    await query("delete from assistants where id = $1 and user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- training material ---------- */

router.get("/:id/knowledge", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });
    const rows = await query(
      "select * from knowledge_items where assistant_id = $1 order by created_at desc",
      [assistant.id]
    );
    res.json({
      items: rows.map(knowledgeApi),
      documents: rows.filter((row) => row.kind === "document").length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/knowledge/:itemId", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });

    const row = await one(
      "select * from knowledge_items where id = $1 and assistant_id = $2 and user_id = $3",
      [req.params.itemId, assistant.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "That training item was not found." });
    res.json({ item: knowledgeApi(row), characters: String(row.content || "").length });
  } catch (error) {
    next(error);
  }
});

/* Ask questions about one document on its own, without the rest of the
   assistant's training. Useful for a long price list or service guide. */
router.post("/:id/knowledge/:itemId/ask", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });

    /* Check token allowance before processing the question. */
    const tokenError = await checkTokenLimit(req.user.id);
    if (tokenError) return res.status(403).json({ error: tokenError, code: "TOKEN_LIMIT" });

    const item = await one(
      "select * from knowledge_items where id = $1 and assistant_id = $2 and user_id = $3",
      [req.params.itemId, assistant.id, req.user.id]
    );
    if (!item) return res.status(404).json({ error: "That training item was not found." });

    const { question } = z
      .object({ question: z.string().trim().min(2, "Type a question first.").max(600) })
      .parse(req.body);

    const system = [
      `You are ${assistant.name}, answering questions about one document for ${item.source_name || "the business"}.`,
      "Answer only from the document below. If the answer is not in it, say so plainly and do not guess.",
      `Quote prices, dates and names exactly as they appear. Reply in ${assistant.language || "English"}.`,
      "Keep the answer short and practical.",
      "",
      `Document: ${item.title || item.source_name || "Training document"}`,
      String(item.content || "").slice(0, 120000),
    ].join("\n");

    const result = await complete({ system, messages: [{ role: "user", content: question }] });
    const answer = result.text;

    /* Keep the legacy token counter in lockstep so nothing else breaks, but
       bill the real OpenAI usage against the customer's SBD AI credits and
       the internal dollar cap. */
    const tokenCost = 3;
    await addTokenUsage(req.user.id, tokenCost);
    await recordAiCost(req.user.id, result.usage);

    res.json({ answer, tokensUsed: tokenCost });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/knowledge", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });

    const body = z
      .object({
        kind: z.enum(["note", "faq", "pricing"]).default("note"),
        title: z.string().trim().max(160).optional().default(""),
        content: z.string().trim().min(2, "Add the information itself.").max(20000),
      })
      .parse(req.body);

    const row = await one(
      `insert into knowledge_items (user_id, assistant_id, kind, title, content)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.user.id, assistant.id, body.kind, body.title, body.content]
    );
    res.status(201).json({ item: knowledgeApi(row), message: "Training information saved." });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/knowledge/pdf", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });
    if (!req.file) return res.status(400).json({ error: "Choose a PDF file to upload." });

    if (req.file.mimetype !== "application/pdf" && !/\.pdf$/i.test(req.file.originalname || "")) {
      return res.status(400).json({ error: "Only PDF documents can be uploaded." });
    }

    /* Check token allowance before processing the PDF. */
    const tokenError = await checkTokenLimit(req.user.id);
    if (tokenError) return res.status(403).json({ error: tokenError, code: "TOKEN_LIMIT" });

    let text = "";
    try {
      const pdfModule = await import("pdf-parse");
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: new Uint8Array(req.file.buffer) });
        const result = await parser.getText();
        text = result.text || "";
        await parser.destroy?.();
      } else {
        const parse = pdfModule.default || pdfModule;
        const result = await parse(req.file.buffer);
        text = result.text || "";
      }
    } catch (error) {
      console.error("[pdf] extraction failed:", error.message);
      const locked = /password|encrypt/i.test(error.message || "");
      return res.status(422).json({
        error: locked
          ? "This PDF is password-protected, so its text cannot be read. Remove the password and upload it again."
          : "That PDF could not be read. It may be damaged or in an unusual format — try exporting it again as a PDF, or add the information manually.",
        code: locked ? "PDF_LOCKED" : "PDF_UNREADABLE",
      });
    }

    /* pdf-parse marks pages with "-- 1 of 1 --"; those markers are noise, but a
       short price list is still valid training material, so the bar for text is
       low and measured in visible characters, not lines. */
    const cleaned = text
      .split("\n")
      .filter((line) => !/^--?\s*\d+\s*(?:of|\/)\s*\d+\s*--?$/.test(line.trim()))
      .join("\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const visibleCharacters = cleaned.replace(/\s/g, "").length;
    console.log(
      `[pdf] ${req.file.originalname || "document.pdf"} (${Math.round(req.file.size / 1024)} KB) → ${visibleCharacters} characters`
    );

    if (visibleCharacters < 8) {
      return res.status(422).json({
        error:
          "This PDF has no text layer — it is a scan or an image, so there is nothing to learn from. Export it as a text PDF, or type the information under Business information instead.",
        code: "PDF_NO_TEXT",
      });
    }

    /* Token cost: each uploaded PDF costs 10 tokens to store and index. */
    const tokenCost = 10;
    await addTokenUsage(req.user.id, tokenCost);

    const row = await one(
      `insert into knowledge_items (user_id, assistant_id, kind, title, content, source_name)
       values ($1, $2, 'document', $3, $4, $5) returning *`,
      [
        req.user.id,
        assistant.id,
        (req.body.title || req.file.originalname || "Document").slice(0, 160),
        cleaned.slice(0, 60000),
        req.file.originalname || "document.pdf",
      ]
    );

    await recordAiCost(req.user.id, null);

    res.status(201).json({
      item: knowledgeApi(row),
      characters: visibleCharacters,
      tokensUsed: tokenCost,
      message: `${req.file.originalname || "PDF"} added — ${visibleCharacters.toLocaleString("en-GB")} characters of text learned.`,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/knowledge/:itemId", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });

    const body = z
      .object({
        title: z.string().trim().max(160).optional(),
        content: z.string().trim().min(2).max(40000).optional(),
      })
      .parse(req.body);

    const row = await one(
      `update knowledge_items
          set title = coalesce($4, title), content = coalesce($5, content), updated_at = now()
        where id = $1 and assistant_id = $2 and user_id = $3
        returning *`,
      [req.params.itemId, assistant.id, req.user.id, body.title ?? null, body.content ?? null]
    );
    if (!row) return res.status(404).json({ error: "That training item was not found." });
    res.json({ item: knowledgeApi(row), message: "Training information updated." });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/knowledge/:itemId", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });
    await query("delete from knowledge_items where id = $1 and assistant_id = $2 and user_id = $3", [
      req.params.itemId,
      assistant.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- conversations and testing ---------- */

router.get("/:id/conversations", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });
    const rows = await query(
      `select c.*,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
              (select m.content from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
         from conversations c
        where c.assistant_id = $1 and c.user_id = $2
        order by c.updated_at desc
        limit 50`,
      [assistant.id, req.user.id]
    );
    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        messageCount: row.message_count,
        lastMessage: row.last_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/chat", requireAuth, async (req, res, next) => {
  try {
    const assistant = await ownedAssistant(req.user.id, req.params.id);
    if (!assistant) return res.status(404).json({ error: "Assistant not found." });

    /* Check token allowance before processing the chat. */
    const tokenError = await checkTokenLimit(req.user.id);
    if (tokenError) return res.status(403).json({ error: tokenError, code: "TOKEN_LIMIT" });

    try {
      await requireActiveAiAccount(req.user.id);
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
        "select * from conversations where id = $1 and user_id = $2 and assistant_id = $3",
        [body.conversationId, req.user.id, assistant.id]
      );
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    }

    const history = conversation
      ? await query(
          `select role, content from messages where conversation_id = $1 order by created_at desc limit 12`,
          [conversation.id]
        )
      : [];

    /* Business profile, products, FAQs and the relevant document passages are
       loaded for this owner and assistant only. */
    const context = await loadKnowledgeBase(req.user.id, {
      assistantId: assistant.id,
      question: body.message,
    });

    const system = buildSystemPrompt({
      assistant,
      business: context.business,
      knowledge: context.knowledge,
      businessContext: context.businessContext,
    });
    const messages = [
      ...history.reverse().map((row) => ({ role: row.role, content: row.content })),
      { role: "user", content: body.message },
    ];

    const result = await complete({ system, messages });
    const reply = result.text;

    /* Keep the legacy token counter in lockstep so nothing else breaks, but
       bill the real OpenAI usage against the customer's SBD AI credits and
       the internal dollar cap. */
    const tokenCost = 5;
    await addTokenUsage(req.user.id, tokenCost);
    await recordAiCost(req.user.id, result.usage);

    if (!conversation) {
      conversation = await one(
        `insert into conversations (user_id, assistant_id, title)
         values ($1, $2, $3) returning *`,
        [req.user.id, assistant.id, body.message.slice(0, 70)]
      );
    }

    await query("insert into messages (conversation_id, role, content) values ($1, 'user', $2)", [
      conversation.id,
      body.message,
    ]);
    await query("insert into messages (conversation_id, role, content) values ($1, 'assistant', $2)", [
      conversation.id,
      reply,
    ]);
    await query("update conversations set updated_at = now() where id = $1", [conversation.id]);

    res.json({ conversationId: conversation.id, reply, tokensUsed: tokenCost });
  } catch (error) {
    next(error);
  }
});

export default router;
