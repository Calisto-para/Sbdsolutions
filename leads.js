import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";

const router = express.Router();

const searchTerm = (value) => `%${String(value || "").trim().replace(/[%_]/g, "")}%`;

/* Enquiries the assistants collected from website visitors. */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select l.*, a.name as assistant_name, c.title as conversation_title, c.channel
         from leads l
         join assistants a on a.id = l.assistant_id
         left join conversations c on c.id = l.conversation_id
        where l.user_id = $1
          and ($2 = '%%'
               or l.name ilike $2
               or l.email ilike $2
               or l.phone ilike $2
               or l.service ilike $2)
        order by l.created_at desc
        limit 200`,
      [req.user.id, q]
    );

    res.json({
      leads: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        service: row.service,
        source: row.source,
        status: row.status,
        assistantName: row.assistant_name,
        conversationId: row.conversation_id,
        conversationTitle: row.conversation_title,
        channel: row.channel,
        createdAt: row.created_at,
      })),
      total: rows.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
