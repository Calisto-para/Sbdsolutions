import express from "express";
import { one } from "../db.js";
import { env } from "../env.js";
import {
  activatePaymentFromWebhook,
  providerSaysPaid,
  verifyPaystackSignature,
  verifyFlutterwaveSignature,
} from "../payments.js";

/*
 * Payment provider webhooks.
 *
 * These routes are public (no session) but signed: the provider notifies the
 * server directly when a payment completes, so the plan activates without the
 * customer returning to the dashboard or an operator clicking Verify.
 *
 * They must be registered before app.use(express.json()) so the raw body is
 * preserved for signature verification, and they respond 200 before any
 * long-running work, so retries stop.
 *
 * Online payments still work without webhooks: the customer's return to the
 * dashboard verifies the payment through the provider API. Webhooks are the
 * faster, automatic path.
 */
const router = express.Router();

const PAYSTACK_EVENT_PAID = "charge.success";
const FLUTTERWAVE_EVENT_PAID = "charge.completed";

/* ---------- Paystack ---------- */

router.post(
  "/paystack",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // Respond first so Paystack stops retrying; reconcile in the background.
    res.sendStatus(200);

    const secret = env.payments.paystack.webhookSecret;
    if (!secret) {
      console.error("[webhook] paystack webhook secret is not configured");
      return;
    }
    const signature =
      req.get("x-paystack-signature") ||
      req.get("paystack-signature") ||
      req.get("Paystack-Signature") ||
      "";
    const matched = verifyPaystackSignature(req.body, signature, [secret]);
    if (!matched) {
      console.error("[webhook] paystack signature rejected");
      return;
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      console.error("[webhook] paystack payload not JSON");
      return;
    }

    if (event.event !== PAYSTACK_EVENT_PAID) return;

    const reference = String(event.data?.reference || "");
    if (!reference) return;

    const payment = await one(
      `select * from payments where reference = $1 and status = 'pending' limit 1`,
      [reference]
    );
    if (!payment) return;

    const result = await activatePaymentFromWebhook(payment, "paystack", event.data);
    if (result.activated) {
      console.log(
        `[webhook] paystack activated invoice ${payment.reference} for ${payment.user_id}`
      );
    } else {
      console.error(
        `[webhook] paystack did not activate invoice ${payment.reference}: ${result.message}`
      );
    }
  }
);

/* ---------- Flutterwave ---------- */

router.post(
  "/flutterwave",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // Respond first so Flutterwave stops retrying; reconcile in the background.
    res.sendStatus(200);

    const secretHash = env.payments.flutterwave.webhookSecret;
    if (!secretHash) {
      console.error("[webhook] flutterwave webhook secret is not configured");
      return;
    }
    const headers = req.headers;
    if (!verifyFlutterwaveSignature(req.body, headers, secretHash)) {
      console.error("[webhook] flutterwave signature rejected");
      return;
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      console.error("[webhook] flutterwave payload not JSON");
      return;
    }

    if (event.event !== FLUTTERWAVE_EVENT_PAID) return;
    if (!providerSaysPaid(event.data)) return;

    // Flutterwave sends our tx_ref as the invoice reference.
    const txRef = String(event.data?.tx_ref || "");
    if (!txRef) return;

    const payment = await one(
      `select * from payments where reference = $1 and status = 'pending' limit 1`,
      [txRef]
    );
    if (!payment) return;

    const result = await activatePaymentFromWebhook(payment, "flutterwave", event.data);
    if (result.activated) {
      console.log(
        `[webhook] flutterwave activated invoice ${payment.reference} for ${payment.user_id}`
      );
    } else {
      console.error(
        `[webhook] flutterwave did not activate invoice ${payment.reference}: ${result.message}`
      );
    }
  }
);

export default router;
