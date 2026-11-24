import OpenAI from "openai";
import { env, aiConfigured } from "./env.js";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI assistant is not connected yet. Add OPENAI_API_KEY to enable chat.");
    this.status = 503;
    this.code = "AI_NOT_CONFIGURED";
  }
}

let client = null;

function getClient() {
  if (!aiConfigured) throw new AiNotConfiguredError();
  if (!client) {
    client = new OpenAI({
      apiKey: env.openai.apiKey,
      baseURL: env.openai.baseUrl || undefined,
    });
  }
  return client;
}

const TONE = {
  friendly: "Warm, helpful and conversational.",
  professional: "Professional, clear and businesslike.",
  concise: "Very concise — short answers, no filler.",
  formal: "Formal and polite, as in a corporate support desk.",
};

function knowledgeBlock(items) {
  if (!items.length) return "No business information has been added yet.";
  const parts = items.map((item) => {
    const label = item.kind === "faq" ? "FAQ" : item.kind === "pricing" ? "Pricing" : item.kind === "document" ? "Document" : "Business information";
    const title = item.title ? `${item.title}: ` : "";
    return `- [${label}] ${title}${item.content}`;
  });
  return parts.join("\n").slice(0, 12000);
}

export function buildSystemPrompt({ assistant, business, knowledge }) {
  return [
    `You are ${assistant.name}, the AI assistant for ${business?.name || "this business"}.`,
    assistant.business_description ? `About the business: ${assistant.business_description}` : "",
    assistant.services ? `Services offered: ${assistant.services}` : "",
    assistant.products ? `Products offered: ${assistant.products}` : "",
    business?.website ? `Website: ${business.website}` : "",
    business?.support_email ? `Support email: ${business.support_email}` : "",
    business?.phone ? `Phone: ${business.phone}` : "",
    `Communication style: ${TONE[assistant.tone] || TONE.friendly}`,
    `Reply in ${assistant.language || "English"}.`,
    "Use only the business information below when answering questions about the business.",
    "If the answer is not covered, say you do not have that detail and offer to pass the enquiry to the team.",
    "Never invent prices, policies or availability. Keep replies short and practical.",
    assistant.instructions ? `Additional instructions from the business owner: ${assistant.instructions}` : "",
    "",
    "Business information supplied by the owner:",
    knowledgeBlock(knowledge),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function complete({ system, messages }) {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: env.openai.model,
    temperature: 0.4,
    max_tokens: 400,
    messages: [{ role: "system", content: system }, ...messages],
  });
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The AI returned an empty response.");
  return text;
}
