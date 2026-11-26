import express from "express";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { agentUsage, currentPlan, usageFor } from "../plans.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const stats = await one(
      `select
         (select count(*)::int from assistants where user_id = $1) as assistants,
         (select count(*)::int from knowledge_items where user_id = $1) as knowledge_items,
         (select count(*)::int from conversations where user_id = $1) as conversations,
         (select count(*)::int from messages m
            join conversations c on c.id = m.conversation_id
           where c.user_id = $1) as messages,
         (select count(*)::int from leads where user_id = $1) as leads,
         (select count(*)::int from conversations where user_id = $1 and status = 'open') as open_conversations`,
      [req.user.id]
    );

    const recentConversations = await query(
      `select c.id, c.title, c.updated_at, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
        order by c.updated_at desc
        limit 5`,
      [req.user.id]
    );

    /* Business-wide records (FAQs, documents) have no assistant_id, so this is a
       left join: recent knowledge includes the shared knowledge base too. */
    const recentKnowledge = await query(
      `select k.id, k.kind, k.title, k.created_at, a.name as assistant_name
         from knowledge_items k
         left join assistants a on a.id = k.assistant_id
        where k.user_id = $1
        order by k.created_at desc
        limit 5`,
      [req.user.id]
    );

    const [limits, monthly, planInfo] = await Promise.all([
      agentUsage(req.user.id),
      usageFor(req.user.id),
      currentPlan(req.user.id),
    ]);

    res.json({
      limits: {
        ...limits,
        customers: monthly.customers,
        customerLimit: planInfo.plan?.message_limit ?? 50,
      },
      stats: {
        assistants: stats.assistants,
        knowledgeItems: stats.knowledge_items,
        conversations: stats.conversations,
        messages: stats.messages,
        leads: stats.leads,
        openConversations: stats.open_conversations,
      },
      recentConversations: recentConversations.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
      recentKnowledge: recentKnowledge.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        assistantName: row.assistant_name,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
