import express from "express";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `select c.*, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
              (select m.content from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
        order by c.updated_at desc
        limit 100`,
      [req.user.id]
    );
    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        assistantId: row.assistant_id,
        assistantName: row.assistant_name,
        messageCount: row.message_count,
        lastMessage: row.last_message,
        updatedAt: row.updated_at,
      })),
    });
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

    const messages = await query(
      "select id, role, content, created_at from messages where conversation_id = $1 order by created_at asc",
      [conversation.id]
    );
    const assistant = await one("select id, name from assistants where id = $1", [conversation.assistant_id]);

    res.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        assistantId: conversation.assistant_id,
        assistantName: assistant?.name || "Assistant",
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      },
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      })),
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
