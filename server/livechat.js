import jwt from "jsonwebtoken";
import { one, query } from "./db.js";
import { env } from "./env.js";
import { createNotification } from "./notify.js";
import { publishOwner, publishVisitor } from "./realtime.js";

/* Shared pieces of the human-takeover flow, used by both the dashboard routes
   and the public widget routes so the state machine lives in one place. */

export const STATUS = {
  AI: "ai_active",
  REQUESTED: "human_requested",
  HUMAN: "human_active",
  RESOLVED: "resolved",
};

/* Rows written before the lifecycle existed use 'open'. */
export function normalizeStatus(status) {
  return status === "open" || !status ? STATUS.AI : status;
}

export function statusLabel(status) {
  switch (normalizeStatus(status)) {
    case STATUS.REQUESTED:
      return "Human requested";
    case STATUS.HUMAN:
      return "Human active";
    case STATUS.RESOLVED:
      return "Resolved";
    default:
      return "AI active";
  }
}

export const humanOwns = (conversation) =>
  normalizeStatus(conversation?.status) === STATUS.HUMAN;

/* AI must not answer while a human request is pending or a person is typing. */
export const aiPaused = (conversation) => {
  const status = normalizeStatus(conversation?.status);
  return status === STATUS.REQUESTED || status === STATUS.HUMAN;
};

/* A visitor may subscribe to their own conversation's live stream, and nothing
   else. The token is signed with the server session secret and names both the
   conversation and the browser's stable visitor id. */
export function visitorStreamToken(conversation) {
  return jwt.sign(
    {
      scope: "widget-stream",
      conversationId: conversation.id,
      visitorKey: conversation.visitor_key || "",
    },
    env.sessionSecret,
    { expiresIn: "12h" }
  );
}

export function readVisitorStreamToken(token) {
  try {
    const payload = jwt.verify(String(token || ""), env.sessionSecret);
    if (payload?.scope !== "widget-stream" || !payload.conversationId) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function findOwnedConversation(userId, conversationId) {
  return one("select * from conversations where id = $1 and user_id = $2", [
    conversationId,
    userId,
  ]);
}

export async function addSystemMessage(conversationId, content) {
  const row = await one(
    `insert into messages (conversation_id, role, content, author, status)
     values ($1, 'assistant', $2, 'system', 'done')
     returning *`,
    [conversationId, content]
  );
  await query("update conversations set last_message_at = now(), updated_at = now() where id = $1", [
    conversationId,
  ]);
  publishVisitor(conversationId, "message", { message: shapeMessage(row) });
  return row;
}

export const shapeMessage = (row) =>
  row
    ? {
        id: row.id,
        role: row.role,
        author: row.author || (row.role === "user" ? "visitor" : "ai"),
        content: row.content,
        clientId: row.client_id || null,
        status: row.status || "done",
        createdAt: row.created_at,
      }
    : null;

/* Tell the owner (and their phone) that a visitor asked for a person. */
export async function notifyHumanRequest({ conversation, assistant }) {
  const title = "New Human Support Request";
  const body = "A visitor is requesting assistance from your business.";
  const stamp = new Date(conversation.human_requested_at || Date.now()).toISOString().slice(0, 19);
  return createNotification({
    userId: conversation.user_id,
    kind: "human_request",
    level: "warning",
    title,
    body,
    link: `/dashboard?tab=live&conversation=${conversation.id}`,
    conversationId: conversation.id,
    dedupeKey: `human-request:${conversation.id}:${stamp}`,
    emailSubject: `${title} — ${assistant?.name || "website chat"}`,
    emailText: [
      `${body}`,
      conversation.visitor_name ? `Visitor: ${conversation.visitor_name}` : "",
      conversation.visitor_email ? `Email: ${conversation.visitor_email}` : "",
      conversation.visitor_phone ? `Phone: ${conversation.visitor_phone}` : "",
      "Open Live Chat in your dashboard to take over the conversation.",
    ]
      .filter(Boolean)
      .join("\n"),
    /* No visitor name or message text on a lock screen. */
    pushBody: body,
    tag: `sbd-human-request-${conversation.id}`,
  });
}

/* A visitor replied while a person is handling the chat. One notification per
   message, and never more than one every 30 seconds per conversation. */
export async function notifyVisitorMessage({ conversation, message, assignedTo }) {
  const recent = await one(
    `select 1 from notifications
      where user_id = $1 and kind = 'visitor_message' and conversation_id = $2
        and created_at > now() - interval '30 seconds'
      limit 1`,
    [conversation.user_id, conversation.id]
  );
  if (recent) return { inserted: false };

  const who = conversation.visitor_name || "A website visitor";
  return createNotification({
    userId: assignedTo || conversation.user_id,
    kind: "visitor_message",
    level: "info",
    title: "New message from a visitor",
    body: `${who} replied in a conversation you are handling.`,
    link: `/dashboard?tab=live&conversation=${conversation.id}`,
    conversationId: conversation.id,
    dedupeKey: `visitor-message:${message.id}`,
    emailSubject: "New message in a live chat you are handling",
    emailText: `${who} sent another message in a conversation you have taken over. Open Live Chat to reply.`,
    pushBody: `${who} replied in a live chat.`,
    tag: `sbd-visitor-${conversation.id}`,
  });
}

/* Publish a message to both ends: the owner's inbox and the visitor widget. */
export function broadcastMessage(conversation, message) {
  const payload = { conversationId: conversation.id, message: shapeMessage(message) };
  publishOwner(conversation.user_id, "message", payload);
  publishVisitor(conversation.id, "message", payload);
}

export function broadcastStatus(conversation) {
  const payload = {
    conversationId: conversation.id,
    status: normalizeStatus(conversation.status),
    takeover: humanOwns(conversation),
    assignedTo: conversation.human_assigned_to || null,
  };
  publishOwner(conversation.user_id, "conversation", payload);
  publishVisitor(conversation.id, "conversation", payload);
}
