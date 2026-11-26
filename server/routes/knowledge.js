import express from "express";
import multer from "multer";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildSystemPrompt, complete, recordAiCost } from "../ai.js";
import {
  addTokenUsage,
  checkTokenLimit,
  requireActiveAiAccount,
} from "../plans.js";
import {
  extractDocument,
  isSupportedDocument,
  MAX_DOCUMENT_BYTES,
} from "../extract.js";
import {
  businessApi,
  documentApi,
  faqApi,
  loadKnowledgeBase,
  offeringApi,
} from "../knowledge.js";

/* The customer's own knowledge base: business information, products and
   services, FAQs and uploaded documents. Everything on this router is scoped to
   the signed-in customer's user id, so one business can never read or change
   another business's information. */

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } });

const text = (max, message) => z.string().trim().max(max, message).optional().default("");

const businessShape = {
  name: text(160),
  description: text(3000),
  industry: text(120),
  website: text(300),
  supportEmail: text(254),
  phone: text(40),
  whatsapp: text(40),
  address: text(400),
  openingHours: text(600),
  socialLinks: text(600),
  additionalInstructions: text(4000),
  paymentMethods: text(600),
  deliveryInfo: text(800),
};

const offeringShape = {
  type: z.enum(["product", "service"]).optional().default("product"),
  name: z.string().trim().min(1, "Give the product or service a name.").max(160),
  description: z.string().trim().max(2000).optional().default(""),
  price: z.string().trim().max(120).optional().default(""),
  options: z.string().trim().max(1200).optional().default(""),
};

const faqShape = {
  question: z.string().trim().min(3, "Write the question.").max(400),
  answer: z.string().trim().min(1, "Write the answer.").max(6000),
};

const asBusiness = (body) => ({
  name: body.name,
  description: body.description,
  industry: body.industry,
  website: body.website,
  support_email: body.supportEmail,
  phone: body.phone,
  whatsapp: body.whatsapp,
  address: body.address,
  opening_hours: body.openingHours,
  social_links: body.socialLinks,
  additional_instructions: body.additionalInstructions,
  payment_methods: body.paymentMethods,
  delivery_info: body.deliveryInfo,
});

async function saveBusiness(userId, body) {
  const row = asBusiness(body);
  return one(
    `insert into businesses
       (user_id, name, description, industry, website, support_email, phone, whatsapp, address,
        opening_hours, social_links, additional_instructions, payment_methods, delivery_info)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (user_id) do update
       set name = excluded.name,
           description = excluded.description,
           industry = excluded.industry,
           website = excluded.website,
           support_email = excluded.support_email,
           phone = excluded.phone,
           whatsapp = excluded.whatsapp,
           address = excluded.address,
           opening_hours = excluded.opening_hours,
           social_links = excluded.social_links,
           additional_instructions = excluded.additional_instructions,
           payment_methods = excluded.payment_methods,
           delivery_info = excluded.delivery_info,
           updated_at = now()
     returning *`,
    [
      userId,
      row.name,
      row.description,
      row.industry,
      row.website,
      row.support_email,
      row.phone,
      row.whatsapp,
      row.address,
      row.opening_hours,
      row.social_links,
      row.additional_instructions,
      row.payment_methods,
      row.delivery_info,
    ]
  );
}

async function ownedAssistant(userId, assistantId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(assistantId || ""))) return null;
  return one("select * from assistants where id = $1 and user_id = $2", [assistantId, userId]);
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const base = await loadKnowledgeBase(req.user.id, { question: "" });
    const business = base.business
      ? businessApi(base.business)
      : businessApi({});
    res.json({
      business,
      offerings: base.offerings.map(offeringApi),
      faqs: base.faqs.map(faqApi),
      documents: base.documents.map((row) => documentApi(row)),
      stats: {
        offerings: base.offerings.length,
        faqs: base.faqs.length,
        documents: base.documents.length,
        documentCharacters: base.documents.reduce((total, row) => total + String(row.content || "").length, 0),
        publishedAt: business.publishedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put("/business", requireAuth, async (req, res, next) => {
  try {
    const body = z.object(businessShape).parse(req.body);
    const row = await saveBusiness(req.user.id, body);
    res.json({ business: businessApi(row), message: "Business information saved." });
  } catch (error) {
    next(error);
  }
});

/* Saving is what the assistant reads, so "publish" only records that the owner
   has reviewed and released these changes. It never hides information the
   assistant already uses. */
router.post("/publish", requireAuth, async (req, res, next) => {
  try {
    const existing = await one("select * from businesses where user_id = $1", [req.user.id]);
    const parsed = z.object(businessShape).partial().parse(req.body || {});
    let row = existing;
    if (Object.keys(parsed).length) {
      row = await saveBusiness(req.user.id, z.object(businessShape).parse({ ...businessApi(existing), ...parsed }));
    }
    if (!row) {
      row = await saveBusiness(req.user.id, z.object(businessShape).parse({}));
    }
    row = await one(
      "update businesses set published_at = now(), updated_at = now() where user_id = $1 returning *",
      [req.user.id]
    );
    res.json({
      business: businessApi(row),
      message: "Your knowledge base is live. Every chat uses it immediately, including conversations already in progress.",
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- products and services ---------- */

router.post("/offerings", requireAuth, async (req, res, next) => {
  try {
    const body = z.object(offeringShape).parse(req.body);
    const row = await one(
      `insert into business_offerings (user_id, type, name, description, price, options)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [req.user.id, body.type, body.name, body.description, body.price, body.options]
    );
    res.status(201).json({ offering: offeringApi(row), message: "Saved." });
  } catch (error) {
    next(error);
  }
});

router.patch("/offerings/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await one("select * from business_offerings where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!existing) return res.status(404).json({ error: "That product or service was not found." });
    const body = z.object(offeringShape).parse({ ...offeringApi(existing), ...req.body });
    const row = await one(
      `update business_offerings
          set type = $3, name = $4, description = $5, price = $6, options = $7, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [req.params.id, req.user.id, body.type, body.name, body.description, body.price, body.options]
    );
    res.json({ offering: offeringApi(row), message: "Updated." });
  } catch (error) {
    next(error);
  }
});

router.delete("/offerings/:id", requireAuth, async (req, res, next) => {
  try {
    await query("delete from business_offerings where id = $1 and user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- FAQs ---------- */

router.post("/faqs", requireAuth, async (req, res, next) => {
  try {
    const body = z.object(faqShape).parse(req.body);
    const row = await one(
      `insert into knowledge_items (user_id, assistant_id, kind, title, content)
       values ($1, null, 'faq', $2, $3) returning *`,
      [req.user.id, body.question, body.answer]
    );
    res.status(201).json({ faq: faqApi(row), message: "FAQ added." });
  } catch (error) {
    next(error);
  }
});

router.patch("/faqs/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await one(
      "select * from knowledge_items where id = $1 and user_id = $2 and kind = 'faq' and assistant_id is null",
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: "That FAQ was not found." });
    const body = z.object(faqShape).parse({ question: existing.title, answer: existing.content, ...req.body });
    const row = await one(
      `update knowledge_items set title = $3, content = $4, updated_at = now()
        where id = $1 and user_id = $2 returning *`,
      [req.params.id, req.user.id, body.question, body.answer]
    );
    res.json({ faq: faqApi(row), message: "FAQ updated." });
  } catch (error) {
    next(error);
  }
});

router.delete("/faqs/:id", requireAuth, async (req, res, next) => {
  try {
    await query(
      "delete from knowledge_items where id = $1 and user_id = $2 and kind = 'faq' and assistant_id is null",
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- documents ---------- */

router.get("/documents/:id", requireAuth, async (req, res, next) => {
  try {
    const row = await one(
      "select * from knowledge_items where id = $1 and user_id = $2 and kind = 'document'",
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "That document was not found." });
    res.json({ document: documentApi(row, { includeText: true }) });
  } catch (error) {
    next(error);
  }
});

router.post("/documents", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose a PDF, DOCX or TXT file to upload." });

    const filename = req.file.originalname || "document";
    if (!isSupportedDocument(filename, req.file.mimetype)) {
      return res.status(400).json({ error: "Only PDF, DOCX and TXT files can be uploaded.", code: "UNSUPPORTED_DOCUMENT" });
    }

    const { kind, text: extracted } = await extractDocument(req.file.buffer, filename, req.file.mimetype);

    /* A very long document is stored in full up to a generous cap; retrieval
       selects the relevant passages, so length does not crowd the assistant. */
    const content = extracted.slice(0, 200000);
    const title = String(req.body.title || "").trim().slice(0, 160) || filename.replace(/\.[^.]+$/, "");

    const row = await one(
      `insert into knowledge_items (user_id, assistant_id, kind, title, content, source_name, mime, size_bytes)
       values ($1, null, 'document', $2, $3, $4, $5, $6) returning *`,
      [req.user.id, title, content, filename, kind === "pdf" ? "application/pdf" : req.file.mimetype || kind, req.file.size || 0]
    );

    res.status(201).json({
      document: documentApi(row),
      characters: content.length,
      message: `${filename} saved — ${content.length.toLocaleString("en-GB")} characters of text are now searchable by your assistant.`,
    });
  } catch (error) {
    if (["UNSUPPORTED_DOCUMENT", "DOCUMENT_LOCKED", "DOCUMENT_UNREADABLE", "DOCUMENT_NO_TEXT"].includes(error?.code)) {
      return res.status(422).json({ error: error.message, code: error.code });
    }
    next(error);
  }
});

router.delete("/documents/:id", requireAuth, async (req, res, next) => {
  try {
    await query(
      "delete from knowledge_items where id = $1 and user_id = $2 and kind = 'document' and assistant_id is null",
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- test the assistant before publishing ---------- */

router.post("/test", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        assistantId: z.string().uuid().optional(),
        question: z.string().trim().min(2, "Type a question first.").max(600),
      })
      .parse(req.body);

    let assistant = null;
    if (body.assistantId) {
      assistant = await ownedAssistant(req.user.id, body.assistantId);
    } else {
      assistant = await one(
        "select * from assistants where user_id = $1 order by created_at asc limit 1",
        [req.user.id]
      );
    }
    if (!assistant) {
      return res.status(400).json({
        error: "Create an AI assistant first, then you can test it against your knowledge base.",
        code: "NO_ASSISTANT",
      });
    }

    const tokenError = await checkTokenLimit(req.user.id);
    if (tokenError) return res.status(403).json({ error: tokenError, code: "TOKEN_LIMIT" });
    try {
      await requireActiveAiAccount(req.user.id);
    } catch (accountError) {
      return res.status(accountError.status || 503).json({ error: accountError.message, code: accountError.code });
    }

    const context = await loadKnowledgeBase(req.user.id, {
      assistantId: assistant.id,
      question: body.question,
    });
    const system = buildSystemPrompt({
      assistant,
      business: context.business,
      knowledge: context.knowledge,
      businessContext: context.businessContext,
    });

    const result = await complete({ system, messages: [{ role: "user", content: body.question }] });

    await addTokenUsage(req.user.id, 3);
    await recordAiCost(req.user.id, result.usage);

    res.json({
      answer: result.text,
      sources: context.sources,
      grounded: context.sources.length > 0,
      note: context.sources.length
        ? "This answer was generated from the information you have saved."
        : "No business information is saved yet, so the assistant had nothing to answer from. Add business information, products or FAQs and test again.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
