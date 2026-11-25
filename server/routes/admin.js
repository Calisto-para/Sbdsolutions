import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAdmin, publicUser } from "../auth.js";

/* Operator area. Every route is admin-only and answers 404 to anyone else, so
   the area is invisible to clients. */
const router = express.Router();
router.use(requireAdmin);

const searchTerm = (value) => `%${String(value || "").trim().replace(/[%_]/g, "")}%`;

router.get("/", async (req, res, next) => {
  try {
    const totals = await one(
      `select
         (select count(*)::int from users) as users,
         (select count(*)::int from users where email_verified_at is not null) as verified_users,
         (select count(*)::int from users where created_at > now() - interval '7 days') as new_users,
         (select count(*)::int from users where role = 'admin') as admins,
         (select count(*)::int from assistants) as assistants,
         (select count(*)::int from conversations) as conversations,
         (select count(*)::int from messages) as messages,
         (select count(*)::int from knowledge_items) as knowledge_items`
    );

    const recentUsers = await query(
      `select id, full_name, business_name, email, role, email_verified_at, created_at
         from users
        order by created_at desc
        limit 8`
    );

    const recentConversations = await query(
      `select c.id, c.title, c.updated_at,
              a.name as assistant_name,
              u.full_name, u.email,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
         join users u on u.id = c.user_id
        order by c.updated_at desc
        limit 8`
    );

    res.json({
      stats: {
        users: totals.users,
        verifiedUsers: totals.verified_users,
        newUsers: totals.new_users,
        admins: totals.admins,
        assistants: totals.assistants,
        conversations: totals.conversations,
        messages: totals.messages,
        knowledgeItems: totals.knowledge_items,
      },
      recentUsers: recentUsers.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        businessName: row.business_name,
        email: row.email,
        role: row.role,
        emailVerified: Boolean(row.email_verified_at),
        createdAt: row.created_at,
      })),
      recentConversations: recentConversations.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        userName: row.full_name,
        userEmail: row.email,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select u.id, u.full_name, u.business_name, u.email, u.country, u.role,
              u.email_verified_at, u.created_at,
              (select count(*)::int from assistants a where a.user_id = u.id) as assistants,
              (select count(*)::int from conversations c where c.user_id = u.id) as conversations
         from users u
        where $1 = '%%'
           or u.full_name ilike $1
           or u.email ilike $1
           or u.business_name ilike $1
        order by u.created_at desc
        limit 50`,
      [q]
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        businessName: row.business_name,
        email: row.email,
        country: row.country,
        role: row.role,
        emailVerified: Boolean(row.email_verified_at),
        assistants: row.assistants,
        conversations: row.conversations,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const user = await one("select * from users where id = $1", [id]);
    if (!user) return res.status(404).json({ error: "Not found." });

    const business = await one("select * from businesses where user_id = $1", [id]);
    const assistants = await query(
      `select a.id, a.name, a.is_active, a.created_at,
              (select count(*)::int from knowledge_items k where k.assistant_id = a.id) as knowledge_items,
              (select count(*)::int from conversations c where c.assistant_id = a.id) as conversations
         from assistants a
        where a.user_id = $1
        order by a.created_at desc`,
      [id]
    );
    const conversations = await query(
      `select c.id, c.title, c.updated_at, a.name as assistant_name,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
        where c.user_id = $1
        order by c.updated_at desc
        limit 10`,
      [id]
    );

    res.json({
      user: {
        ...publicUser(user),
        country: user.country,
        phone: user.phone,
        createdAt: user.created_at,
      },
      business: business
        ? {
            name: business.name,
            industry: business.industry,
            website: business.website,
            supportEmail: business.support_email,
            phone: business.phone,
            address: business.address,
            description: business.description,
          }
        : null,
      assistants: assistants.map((row) => ({
        id: row.id,
        name: row.name,
        active: Boolean(row.is_active),
        knowledgeItems: row.knowledge_items,
        conversations: row.conversations,
        createdAt: row.created_at,
      })),
      conversations: conversations.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { role } = z.object({ role: z.enum(["client", "admin"]) }).parse(req.body);

    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot change your own role." });
    }

    const updated = await one("update users set role = $2, updated_at = now() where id = $1 returning *", [
      id,
      role,
    ]);
    if (!updated) return res.status(404).json({ error: "Not found." });

    res.json({ ok: true, user: publicUser(updated) });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const rows = await query(
      `select c.id, c.title, c.updated_at,
              a.name as assistant_name,
              u.full_name, u.email,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
         join assistants a on a.id = c.assistant_id
         join users u on u.id = c.user_id
        where $1 = '%%'
           or c.title ilike $1
           or u.email ilike $1
           or u.full_name ilike $1
           or a.name ilike $1
        order by c.updated_at desc
        limit 50`,
      [q]
    );

    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        assistantName: row.assistant_name,
        userName: row.full_name,
        userEmail: row.email,
        messageCount: row.message_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
