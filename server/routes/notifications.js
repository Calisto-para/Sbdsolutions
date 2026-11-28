import express from "express";
import { z } from "zod";
import { query, one } from "../db.js";
import { requireAuth } from "../auth.js";
import {
  NOTIFICATION_DEFAULTS,
  notificationPreferences,
  saveNotificationPreferences,
  shape,
  unreadCount,
} from "../notify.js";
import { pushConfigured, pushPublicConfig, sendPush } from "../push.js";

/* Notification centre, preferences and phone push registration. All routes are
   authenticated and every device is tied to the signed-in account. */
const router = express.Router();

router.use(requireAuth);

/* Public Firebase values only — never the service account. */
router.get("/push/config", (req, res) => {
  res.json(pushPublicConfig());
});

router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const rows = await query(
      `select * from notifications where user_id = $1
        order by created_at desc limit $2`,
      [req.user.id, limit]
    );
    res.json({
      notifications: rows.map(shape),
      unread: await unreadCount(req.user.id),
      preferences: notificationPreferences(req.user),
      push: { configured: pushConfigured(), devices: await deviceList(req.user.id) },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/read-all", async (req, res, next) => {
  try {
    await query(
      "update notifications set read_at = now() where user_id = $1 and read_at is null",
      [req.user.id]
    );
    res.json({ ok: true, unread: 0 });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/read", async (req, res, next) => {
  try {
    const row = await one(
      `update notifications set read_at = coalesce(read_at, now())
        where id = $1 and user_id = $2 returning *`,
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: "Notification not found." });
    res.json({ notification: shape(row), unread: await unreadCount(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get("/preferences", async (req, res, next) => {
  try {
    res.json({
      preferences: notificationPreferences(req.user),
      defaults: NOTIFICATION_DEFAULTS,
      push: { configured: pushConfigured(), devices: await deviceList(req.user.id) },
    });
  } catch (error) {
    next(error);
  }
});

const preferenceSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  humanRequests: z.boolean().optional(),
  newMessages: z.boolean().optional(),
  unanswered: z.boolean().optional(),
  usageWarnings: z.boolean().optional(),
});

router.patch("/preferences", async (req, res, next) => {
  try {
    const patch = preferenceSchema.parse(req.body || {});
    const preferences = await saveNotificationPreferences(req.user.id, patch);
    res.json({ preferences, message: "Notification preferences saved." });
  } catch (error) {
    next(error);
  }
});

async function deviceList(userId) {
  const rows = await query(
    `select id, label, platform, user_agent, created_at, last_seen_at, last_error
       from push_devices where user_id = $1 order by last_seen_at desc`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label || "This device",
    platform: row.platform,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    lastError: row.last_error || "",
  }));
}

/* Register one device. A browser that registers twice keeps one row, so the
   owner's device list cannot fill with duplicates. */
router.post("/push/devices", async (req, res, next) => {
  try {
    const body = z
      .object({
        token: z.string().trim().min(20, "That registration token is not valid.").max(4096),
        label: z.string().trim().max(80).optional().default(""),
        platform: z.string().trim().max(40).optional().default("web"),
        userAgent: z.string().trim().max(300).optional().default(""),
      })
      .parse(req.body);

    const row = await one(
      `insert into push_devices (user_id, token, label, platform, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, token) do update
         set label = coalesce(nullif(excluded.label, ''), push_devices.label),
             platform = excluded.platform,
             user_agent = excluded.user_agent,
             last_seen_at = now(),
             last_error = ''
       returning id`,
      [req.user.id, body.token, body.label, body.platform, body.userAgent]
    );

    res.status(201).json({
      ok: true,
      device: { id: row.id },
      devices: await deviceList(req.user.id),
      message: "Phone notifications are on for this device.",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/push/devices/:id", async (req, res, next) => {
  try {
    const row = await one("delete from push_devices where id = $1 and user_id = $2 returning id", [
      req.params.id,
      req.user.id,
    ]);
    if (!row) return res.status(404).json({ error: "Device not found." });
    res.json({ ok: true, devices: await deviceList(req.user.id) });
  } catch (error) {
    next(error);
  }
});

/* The browser that is turning notifications off sends its own token. */
router.post("/push/devices/remove", async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().trim().min(1).max(4096) }).parse(req.body);
    await query("delete from push_devices where user_id = $1 and token = $2", [
      req.user.id,
      token,
    ]);
    res.json({ ok: true, devices: await deviceList(req.user.id) });
  } catch (error) {
    next(error);
  }
});

/* A real test notification to this account's registered devices. */
router.post("/push/test", async (req, res, next) => {
  try {
    if (!pushConfigured()) {
      return res.status(503).json({
        error: "Phone notifications are not configured on this server yet. Add the Firebase keys to the service environment.",
        code: "PUSH_NOT_CONFIGURED",
      });
    }
    const devices = await query("select token from push_devices where user_id = $1", [req.user.id]);
    if (!devices.length) {
      return res.status(400).json({ error: "Enable phone notifications on a device first.", code: "NO_DEVICES" });
    }
    const result = await sendPush(
      devices.map((device) => device.token),
      {
        title: "SBD Solutions test notification",
        body: "If you can see this, phone notifications are working.",
        link: "/dashboard?tab=notifications",
        tag: "sbd-test",
        data: { kind: "test" },
      }
    );
    if (result.invalid?.length) {
      await query("delete from push_devices where user_id = $1 and token = any($2::text[])", [
        req.user.id,
        result.invalid,
      ]);
    }
    res.json({
      ok: result.sent > 0,
      sent: result.sent,
      failed: result.failed,
      detail: result.detail || "",
      message:
        result.sent > 0
          ? `Test notification sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`
          : `The test could not be delivered${result.detail ? ` (${result.detail})` : ""}.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
