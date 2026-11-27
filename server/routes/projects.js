import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { one, query } from "../db.js";
import { env } from "../env.js";
import { sendProjectEnquiryEmail, sendProjectEnquiryAcknowledgementEmail } from "../mail.js";
import { SERVICES, findService, startingPrice } from "../../shared/project-services.js";

/* Public project enquiries. A submission is written to the database first and
   only then is the notification email attempted: a mail outage must never lose
   a customer's enquiry. Nothing is charged here — the starting price is shown
   for context and the final quotation is prepared by an operator. */
const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many enquiries from this connection. Please try again later or message us on WhatsApp." },
});

const SERVICE_SLUGS = SERVICES.map((service) => service.slug);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enquirySchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  businessName: z.string().trim().max(160).optional().default(""),
  email: z
    .string()
    .trim()
    .max(254)
    .regex(EMAIL, "Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a phone or WhatsApp number we can reach you on.")
    .max(40)
    .refine((value) => value.replace(/\D/g, "").length >= 7, "Enter a valid phone or WhatsApp number."),
  service: z.enum(SERVICE_SLUGS, { message: "Choose the service you are enquiring about." }),
  /* Every project is priced in USD. A currency sent by an older client is
     accepted but never changes the quoted starting price. */
  currency: z.string().trim().max(3).optional().default("USD"),
  estimatedBudget: z.string().trim().max(80).optional().default(""),
  description: z
    .string()
    .trim()
    .min(20, "Describe the project in at least 20 characters.")
    .max(5000),
  additionalRequirements: z.string().trim().max(3000).optional().default(""),
});

router.post("/", limiter, async (req, res, next) => {
  try {
    const body = enquirySchema.parse(req.body);
    const service = findService(body.service);
    const price = startingPrice(service);

    const row = await one(
      `insert into project_enquiries
         (full_name, business_name, email, phone, service, currency, estimated_budget,
          description, additional_requirements, starting_price_amount, starting_price_currency,
          base_amount_usd, payment_currency, payment_arrangement, notification_status)
       values ($1, $2, $3, $4, $5, 'USD', $6, $7, $8, $9, 'USD', $9, 'USD', $10, 'pending')
       returning *`,
      [
        body.fullName,
        body.businessName,
        body.email.toLowerCase(),
        body.phone,
        body.service,
        body.estimatedBudget,
        body.description,
        body.additionalRequirements,
        price,
        "60% upfront before development begins; 40% before final launch or handover",
      ]
    );

    /* From here on the enquiry is safely stored. An email problem is recorded
       and reported to the visitor, but never turns a saved enquiry into a
       failed submission. */
    let delivered = false;
    let notificationError = "";
    try {
      const result = await sendProjectEnquiryEmail(
        {
          ...row,
          serviceName: service.name,
          startingPrice: price,
        },
        env.projectEnquiryEmails
      );
      delivered = Boolean(result.delivered);
      notificationError = delivered
        ? ""
        : result.failures?.join(" | ") || (!result.provider && "No email provider is configured.") || "Email was not delivered.";
    } catch (error) {
      notificationError = error.message || "Email was not delivered.";
    }

    await query(
      `update project_enquiries
          set notification_status = $2,
              notification_error = $3,
              updated_at = now()
        where id = $1`,
      [row.id, delivered ? "sent" : "failed", notificationError]
    );

    /* The customer's own confirmation is best-effort too: the enquiry is already
       stored and the owner already notified, so a mail failure here is only
       reported, never a failed submission. */
    let acknowledged = false;
    try {
      const ack = await sendProjectEnquiryAcknowledgementEmail(
        { ...row, serviceName: service.name, startingPrice: price },
        row.email
      );
      acknowledged = Boolean(ack?.delivered);
    } catch (error) {
      console.error(`[enquiry] acknowledgement failed for ${row.id} — ${error.message}`);
    }

    const reference = `SBD-${String(row.id).slice(0, 8).toUpperCase()}`;
    res.status(201).json({
      ok: true,
      enquiryId: row.id,
      reference,
      service: service.name,
      startingPrice: { amount: price, currency: "USD" },
      notification: {
        delivered,
        message: delivered
          ? "The team has been notified by email."
          : "The enquiry was saved, but the notification email could not be delivered. The team can still see it in the dashboard.",
      },
      acknowledgement: {
        delivered: acknowledged,
        message: acknowledged
          ? "A confirmation has been emailed to you."
          : "A confirmation email could not be sent to you, but your enquiry is saved.",
      },
      message:
        "Your enquiry has been saved. SBD Solutions will review it and send a final quotation before any payment is requested.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
