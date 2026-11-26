import { query, one } from "./db.js";
import { chunkDocument, rankChunks } from "./extract.js";

/* One customer's knowledge base, loaded fresh on every chat request. Nothing is
   cached, so saved changes are used by the very next question and the customer
   never has to recreate an assistant.

   Every query is scoped by user_id: a business can only ever load its own
   information, products, FAQs and documents. */

export function businessContextText(business, offerings = []) {
  if (!business) return "";
  const lines = [];
  const add = (label, value) => {
    const text = String(value ?? "").trim();
    if (text) lines.push(`${label}: ${text}`);
  };

  add("Business name", business.name);
  add("What the business does", business.description);
  add("Industry", business.industry);
  add("Address or service area", business.address);
  add("Opening hours", business.opening_hours);
  add("Phone", business.phone);
  add("WhatsApp", business.whatsapp);
  add("Email", business.support_email);
  add("Website", business.website);
  add("Social media", business.social_links);
  add("Payment methods", business.payment_methods);
  add("Delivery information", business.delivery_info);
  add("Extra instructions from the owner", business.additional_instructions);

  if (offerings.length) {
    lines.push("Products and services:");
    for (const item of offerings) {
      const parts = [item.type === "service" ? "Service" : "Product", item.name];
      if (item.description) parts.push(`description: ${item.description}`);
      if (item.price) parts.push(`price: ${item.price}`);
      if (item.options) parts.push(`options/packages: ${item.options}`);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export const offeringApi = (row) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  description: row.description,
  price: row.price,
  options: row.options,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const faqApi = (row) => ({
  id: row.id,
  question: row.title,
  answer: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const documentApi = (row, { includeText = false } = {}) => ({
  id: row.id,
  name: row.title || row.source_name || "Document",
  sourceName: row.source_name,
  mime: row.mime,
  sizeBytes: row.size_bytes,
  characters: String(row.content || "").length,
  preview: String(row.content || "").slice(0, 400),
  ...(includeText ? { text: String(row.content || "") } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const businessApi = (row) =>
  row
    ? {
        name: row.name || "",
        description: row.description || "",
        industry: row.industry || "",
        website: row.website || "",
        supportEmail: row.support_email || "",
        phone: row.phone || "",
        whatsapp: row.whatsapp || "",
        address: row.address || "",
        openingHours: row.opening_hours || "",
        socialLinks: row.social_links || "",
        additionalInstructions: row.additional_instructions || "",
        paymentMethods: row.payment_methods || "",
        deliveryInfo: row.delivery_info || "",
        publishedAt: row.published_at || null,
        updatedAt: row.updated_at || null,
      }
    : null;

async function knowledgeRows(userId, assistantId) {
  return query(
    `select * from knowledge_items
      where user_id = $1
        and (assistant_id is null or assistant_id = $2)
      order by created_at desc
      limit 400`,
    [userId, assistantId || null]
  );
}

/* Everything the assistant is allowed to read, plus the sources that were
   actually used, so the dashboard can show whether an answer was based on the
   customer's own saved information. */
export async function loadKnowledgeBase(userId, { assistantId = null, question = "", documentBudget = 12000 } = {}) {
  const [business, offerings, rows] = await Promise.all([
    one("select * from businesses where user_id = $1", [userId]),
    query("select * from business_offerings where user_id = $1 order by created_at asc", [userId]),
    knowledgeRows(userId, assistantId),
  ]);

  const faqs = rows.filter((row) => row.kind === "faq");
  const documents = rows.filter((row) => row.kind === "document");
  const notes = rows.filter((row) => row.kind !== "faq" && row.kind !== "document");

  const knowledge = notes.map((row) => ({
    kind: row.kind,
    title: row.title,
    content: row.content,
  }));

  for (const row of faqs) {
    knowledge.push({
      kind: "faq",
      title: row.title,
      content: `Question: ${row.title}\nAnswer: ${row.content}`,
    });
  }

  /* Long documents are chunked and only the passages that match the question
     are sent, so a 40-page price list is searchable instead of truncated. */
  const chunks = [];
  for (const document of documents) {
    for (const chunk of chunkDocument(document.content)) {
      chunks.push({ ...chunk, document });
    }
  }
  const picked = rankChunks(chunks, question, documentBudget);
  for (const chunk of picked) {
    const name = chunk.document.title || chunk.document.source_name || "Document";
    knowledge.push({
      kind: "document",
      title: `${name} (part ${chunk.index + 1})`,
      content: chunk.text,
    });
  }

  const sources = [];
  if (business && (business.name || business.description)) sources.push("Business information");
  if (offerings.length) sources.push(`${offerings.length} product${offerings.length === 1 ? "" : "s"} and services`);
  if (faqs.length) sources.push(`${faqs.length} FAQ${faqs.length === 1 ? "" : "s"}`);
  for (const chunk of picked) {
    const name = chunk.document.title || chunk.document.source_name || "Document";
    if (!sources.includes(`Document: ${name}`)) sources.push(`Document: ${name}`);
  }

  return {
    business,
    offerings,
    faqs,
    documents,
    knowledge,
    businessContext: businessContextText(business, offerings),
    sources,
    grounded: sources.length > 0,
  };
}
