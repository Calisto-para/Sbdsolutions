import express from "express";
import { z } from "zod";
import { one, query } from "../db.js";
import { readSession, requireAuth } from "../auth.js";
import { sendProjectEnquiryEmail } from "../mail.js";

const router = express.Router();

const statusValues = ["New", "Reviewing", "Quoted", "Approved", "Rejected", "Completed"];
const paymentValues = ["Unpaid", "Part paid", "Paid", "Refunded"];
const serviceValues = [
  "AI Solutions",
  "AI Chatbot Development",
  "WhatsApp Automation",
  "Business Process Automation",
  "Website Development",
  "E-commerce Development",
  "Custom Software Development",
  "Other Technology Solutions",
];
const budgetValues = [
  "Below $100",
  "$100–$300",
  "$300–$500",
  "$500–$1,000",
  "Above $1,000",
  "Not yet determined",
];

const shape = (row) => ({
  id: row.id,
  userId: row.user_id,
  fullName: row.full_name,
  businessName: row.business_name,
  email: row.email,
  phone: row.phone,
  country: row.country,
  service: row.service,
  currency: row.currency,
  estimatedBudget: row.estimated_budget,
  description: row.description,
  additionalRequirements: row.additional_requirements,
  status: row.status,
  quotationAmount: row.quotation_amount == null ? null : Number(row.quotation_amount),
  quotationCurrency: row.quotation_currency,
  includedServices: row.included_services,
  costLines: row.cost_lines || [],
  paymentArrangement: row.payment_arrangement,
  paymentStatus: row.payment_status,
  paymentReference: row.payment_reference,
  history: row.history || [],
  notificationStatus: row.notification_status,
  notificationError: row.notification_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      fullName: z.string().trim().min(2).max(120),
      businessName: z.string().trim().max(160).optional().default(""),
      email: z.string().trim().email().max(254),
      phone: z.string().trim().min(6).max(40),
      country: z.string().trim().max(100).optional().default(""),
      service: z.enum(serviceValues),
      currency: z.enum(["NGN", "USD"]),
      estimatedBudget: z.enum(budgetValues),
      description: z.string().trim().min(10).max(5000),
      additionalRequirements: z.string().trim().max(3000).optional().default(""),
    }).parse(req.body);

    let userId = null;
    const session = readSession(req);
    if (session?.sub) {
      const user = await one("select id from users where id = $1", [session.sub]);
      if (user) userId = user.id;
    }

    const row = await one(
      `insert into project_enquiries
       (user_id, full_name, business_name, email, phone, country, service, currency,
        estimated_budget, description, additional_requirements, status, history)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'New',
               jsonb_build_array(jsonb_build_object('status','New','note','Enquiry submitted','at',now())))
       returning *`,
      [userId, body.fullName, body.businessName, body.email, body.phone, body.country,
       body.service, body.currency, body.estimatedBudget, body.description, body.additionalRequirements]
    );

    let mailResult = { delivered: false, failures: ["Email provider unavailable"] };
    try {
      mailResult = await sendProjectEnquiryEmail({
        full_name: row.full_name,
        business_name: row.business_name,
        email: row.email,
        phone: row.phone,
        country: row.country,
        service: row.service,
        currency: row.currency,
        estimated_budget: row.estimated_budget,
        description: row.description,
        additional_requirements: row.additional_requirements,
      });
    } catch (error) {
      mailResult = { delivered: false, failures: [error.message] };
    }

    const notificationStatus = mailResult.delivered ? "sent" : "failed";
    const notificationError = mailResult.delivered
      ? ""
      : (mailResult.failures || []).join(" | ").slice(0, 1000);
    try {
      await one(
        `update project_enquiries
            set notification_status = $2,
                notification_error = $3,
                updated_at = now()
          where id = $1
          returning *`,
        [row.id, notificationStatus, notificationError]
      );
    } catch (error) {
      console.error(`[projects] enquiry ${row.id} was saved, but notification status could not be updated: ${error.message}`);
    }

    res.status(201).json({
      ok: true,
      enquiry: shape({ ...row, notification_status: notificationStatus, notification_error: notificationError }),
      notificationDelivered: Boolean(mailResult.delivered),
      message: mailResult.delivered
        ? "Your project enquiry was saved and sent to our team."
        : "Your project enquiry was saved, but the notification email could not be delivered.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      "select * from project_enquiries where user_id = $1 order by created_at desc",
      [req.user.id]
    );
    res.json({ enquiries: rows.map(shape) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin", async (req, res, next) => next());
router.patch("/admin/:id", async (req, res, next) => next());

export default router;
