import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import { activatePayment } from "../payments.js";

const router = express.Router();
router.use(requireAuth);

const STATUSES = ["pending", "reviewing", "offer_sent", "awaiting_customer", "approved", "rejected", "completed"];

const createSchema = z.object({
  kind: z.enum(["service", "subscription"]).default("service"),
  product: z.string().trim().max(120).default(""),
  title: z.string().trim().min(3).max(160),
  contactName: z.string().trim().max(120).default(""),
  businessName: z.string().trim().max(160).default(""),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).default(""),
  expectedUsage: z.string().trim().max(1000).default(""),
  requirements: z.string().trim().min(20, "Describe the requirement in at least 20 characters.").max(6000),
  websites: z.coerce.number().int().min(0).max(1000).optional(),
  whatsappNumbers: z.coerce.number().int().min(0).max(1000).optional(),
  budget: z.string().trim().max(120).default(""),
  billingPreference: z.string().trim().max(120).default(""),
});

const respondSchema = z.object({
  action: z.enum(["accept", "decline", "revision"]),
  note: z.string().trim().max(1000).optional().default(""),
});

const offerView = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  currency: row.currency,
  billingPeriod: row.billing_period,
  credits: row.credits,
  customerLimit: row.customer_limit,
  websiteLimit: row.website_limit,
  assistantLimit: row.assistant_limit,
  zeroCost: Boolean(row.zero_cost),
  includedFeatures: row.included_features,
  conditions: row.conditions,
  expiresAt: row.expires_at,
  status: row.status,
  createdAt: row.created_at,
});

router.get("/", async (req, res, next) => {
  try {
    const requests = await query(
      `select * from custom_requests where user_id = $1 order by updated_at desc limit 100`,
      [req.user.id]
    );
    const offers = requests.length
      ? await query(
          `select * from custom_offers where request_id = any($1::uuid[]) order by created_at desc`,
          [requests.map((row) => row.id)]
        )
      : [];
    res.json({
      requests: requests.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        product: row.product,
        requirements: row.requirements,
        expectedUsage: row.expected_usage,
        budget: row.budget,
        billingPreference: row.billing_preference,
        websites: row.websites,
        whatsappNumbers: row.whatsapp_numbers,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        offers: offers.filter((offer) => offer.request_id === row.id).map(offerView),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body || {});
    const created = await one(
      `insert into custom_requests
         (user_id, kind, product, title, contact_name, business_name, email, phone, expected_usage,
          requirements, websites, whatsapp_numbers, budget, billing_preference)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        req.user.id, input.kind, input.product, input.title, input.contactName, input.businessName,
        input.email, input.phone, input.expectedUsage, input.requirements,
        input.websites ?? null, input.whatsappNumbers ?? null, input.budget, input.billingPreference,
      ]
    );
    res.status(201).json({ request: { id: created.id, status: created.status } });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Check the details." });
    }
    next(error);
  }
});

router.post("/:id/offers/:offerId/respond", async (req, res, next) => {
  try {
    const input = respondSchema.parse(req.body || {});
    const request = await one("select * from custom_requests where id = $1 and user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (!request) return res.status(404).json({ error: "Request not found." });
    const offer = await one("select * from custom_offers where id = $1 and request_id = $2", [
      req.params.offerId,
      request.id,
    ]);
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "sent") {
      return res.status(400).json({ error: "This offer can no longer be answered." });
    }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      return res.status(400).json({ error: "This offer has expired." });
    }

    if (input.action === "accept") {
      const reference = `SBD-CR-${offer.id.slice(0, 8).toUpperCase()}`;
      const payment = await one(
        `insert into payments (user_id, plan_id, amount, currency, status, method, description, reference, kind)
         values ($1, 'custom', $2, $3, 'pending', 'offline', $4, $5, 'custom')
         returning *`,
        [req.user.id, Number(offer.price), offer.currency, `${offer.name} — custom offer`, reference]
      );
      await query(
        `update custom_offers
            set status = 'accepted', payment_id = $2, responded_at = now(), updated_at = now()
          where id = $1`,
        [offer.id, payment.id]
      );
      await query("update custom_requests set status = 'awaiting_customer', updated_at = now() where id = $1", [
        request.id,
      ]);

      /* A zero-cost offer is only honoured when the operator marked it so.
         The activation still goes through the same provisioning path as a
         paid invoice, so allowances are handled by one code path. */
      if (offer.zero_cost && Number(offer.price) === 0) {
        await activatePayment(payment, { method: "zero-cost-offer" });
        return res.json({
          ok: true,
          payment: { id: payment.id, reference, amount: 0, currency: payment.currency },
          message: "Offer accepted. Your custom allowances are active now — no payment is required.",
        });
      }

      return res.json({
        ok: true,
        payment: { id: payment.id, reference, amount: Number(payment.amount), currency: payment.currency },
        message: "Offer accepted. Pay the invoice from your Subscription page; the request is approved once payment is verified.",
      });
    }

    await query(
      `update custom_offers
          set status = $2, revision_note = $3, responded_at = now(), updated_at = now()
        where id = $1`,
      [offer.id, input.action === "decline" ? "declined" : "revision_requested", input.note || ""]
    );
    await query("update custom_requests set status = 'reviewing', updated_at = now() where id = $1", [request.id]);
    res.json({ ok: true, message: input.action === "decline" ? "Offer declined." : "Revision requested." });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.issues[0]?.message || "Check the details." });
    }
    next(error);
  }
});

export { STATUSES };
export default router;
