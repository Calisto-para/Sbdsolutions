import express from "express";
import { z } from "zod";
import { one } from "../db.js";
import { requireAuth } from "../auth.js";

const router = express.Router();

const shape = {
  name: z.string().trim().max(160).optional().default(""),
  industry: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  supportEmail: z.string().trim().max(254).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
};

const toApi = (row) =>
  row
    ? {
        name: row.name,
        industry: row.industry,
        website: row.website,
        description: row.description,
        supportEmail: row.support_email,
        phone: row.phone,
        address: row.address,
        updatedAt: row.updated_at,
      }
    : null;

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const row = await one("select * from businesses where user_id = $1", [req.user.id]);
    res.json({ business: toApi(row) });
  } catch (error) {
    next(error);
  }
});

router.put("/", requireAuth, async (req, res, next) => {
  try {
    const body = z.object(shape).parse(req.body);
    const row = await one(
      `insert into businesses (user_id, name, industry, website, description, support_email, phone, address)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id) do update
         set name = excluded.name,
             industry = excluded.industry,
             website = excluded.website,
             description = excluded.description,
             support_email = excluded.support_email,
             phone = excluded.phone,
             address = excluded.address,
             updated_at = now()
       returning *`,
      [req.user.id, body.name, body.industry, body.website, body.description, body.supportEmail, body.phone, body.address]
    );
    res.json({ business: toApi(row), message: "Business details saved." });
  } catch (error) {
    next(error);
  }
});

export default router;
