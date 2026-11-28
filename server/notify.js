import { query, one } from "./db.js";
import { env } from "./env.js";
import { sendNotificationEmail } from "./mail.js";
import { sendPush } from "./push.js";
import { publishOwner } from "./realtime.js";

/* One place that records an in-app notification and, when the owner allows it,
   sends the same event by email and phone push.
 *
 * Deduplication is enforced by the database: notifications has a unique
 * (user_id, dedupe_key) index, so a retried request or a re-render of the
 * dashboard can never announce the same thing twice.
 */

export const NOTIFICATION_DEFAULTS = {
  push: true,
  email: true,
  humanRequests: true,
  newMessages: true,
  unanswered: true,
  usageWarnings: true,
};

export function notificationPreferences(user) {
  const stored = user?.preferences?.notifications || {};
  const merged = { ...NOTIFICATION_DEFAULTS };
  for (const key of Object.keys(NOTIFICATION_DEFAULTS)) {
    if (typeof stored[key] === "boolean") merged[key] = stored[key];
  }
  return merged;
}

export async function saveNotificationPreferences(userId, patch) {
  const user = await one("select preferences from users where id = $1", [userId]);
  const current = user?.preferences || {};
  const notifications = { ...notificationPreferences(user) };
  for (const key of Object.keys(NOTIFICATION_DEFAULTS)) {
    if (typeof patch?.[key] === "boolean") notifications[key] = patch[key];
  }
  const next = { ...current, notifications };
  await query("update users set preferences = $2, updated_at = now() where id = $1", [
    userId,
    JSON.stringify(next),
  ]);
  return notifications;
}

/* Which preference gates a given notification kind. Usage warnings and support
   requests are independent switches so a busy owner can mute one without
   losing the other. */
function allowed(prefs, kind) {
  if (kind === "usage_warning") return prefs.usageWarnings;
  if (kind === "human_request" || kind === "unanswered") return prefs.humanRequests;
  if (kind === "visitor_message") return prefs.newMessages;
  return true;
}

async function ownerEmail(userId) {
  const row = await one(
    `select u.email, u.full_name, b.support_email, b.name as business_name
       from users u
       left join businesses b on b.user_id = u.id
      where u.id = $1`,
    [userId]
  );
  return {
    to: String(row?.support_email || row?.email || "").trim(),
    name: row?.business_name || row?.full_name || "",
  };
}

/**
 * Record and deliver a notification.
 *
 * email/push default to the owner's preferences; pass `forcePush` for events
 * that must always attempt a phone notification (still gated by the master
 * push switch). The returned `inserted` is false for a duplicate.
 */
export async function createNotification({
  userId,
  kind = "system",
  level = "info",
  title,
  body = "",
  link = "",
  conversationId = null,
  dedupeKey,
  emailSubject = "",
  emailText = "",
  pushBody = "",
  tag = "",
}) {
  const key = String(dedupeKey || "").trim();
  if (!userId || !title || !key) return { inserted: false, notification: null };

  const inserted = await one(
    `insert into notifications (user_id, kind, level, title, body, link, conversation_id, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, dedupe_key) do nothing
     returning *`,
    [userId, kind, level, title, body, link, conversationId, key]
  );
  if (!inserted) return { inserted: false, notification: null };

  const user = await one("select * from users where id = $1", [userId]);
  const prefs = notificationPreferences(user);
  const notify = allowed(prefs, kind);

  let emailStatus = "skipped";
  let pushStatus = "skipped";

  if (notify && prefs.email) {
    try {
      const { to } = await ownerEmail(userId);
      emailStatus = to ? "sending" : "no-address";
      if (to) {
        const result = await sendNotificationEmail(
          {
            title,
            text: emailText || body,
            link: link ? `${link}` : "",
            businessName: user?.business_name || "",
          },
          to
        );
        emailStatus = result?.delivered ? "sent" : "failed";
      }
    } catch (error) {
      emailStatus = "failed";
      console.error(`[notify] email failed for ${userId}: ${error.message}`);
    }
  }

  if (notify && prefs.push) {
    pushStatus = "sending";
    try {
      const devices = await query("select id, token from push_devices where user_id = $1", [userId]);
      if (!devices.length) {
        pushStatus = "no-devices";
      } else {
        const absoluteLink = link && /^https?:\/\//i.test(link) ? link : `${env.appUrl}${link || "/dashboard"}`;
        const result = await sendPush(
          devices.map((device) => device.token),
          {
            title,
            /* Never put visitor content on a lock screen. */
            body: pushBody || body,
            link: absoluteLink,
            tag: tag || `sbd-${kind}`,
            data: {
              kind,
              conversationId: conversationId || "",
              link: link || "/dashboard",
            },
          }
        );
        if (result.invalid?.length) {
          await query(
            "delete from push_devices where user_id = $1 and token = any($2::text[])",
            [userId, result.invalid]
          );
        }
        pushStatus = result.sent ? "sent" : result.failed ? "failed" : "no-devices";
        if (result.sent && result.failed) pushStatus = "partial";
        if (!result.sent && result.detail) {
          await query("update push_devices set last_error = $2 where user_id = $1", [
            userId,
            String(result.detail).slice(0, 300),
          ]);
        }
      }
    } catch (error) {
      pushStatus = "failed";
      console.error(`[notify] push failed for ${userId}: ${error.message}`);
    }
  }

  const row = await one(
    `update notifications set email_status = $2, push_status = $3 where id = $1 returning *`,
    [inserted.id, emailStatus, pushStatus]
  );

  publishOwner(userId, "notification", { notification: shape(row), unread: await unreadCount(userId) });

  return { inserted: true, notification: shape(row), emailStatus, pushStatus };
}

export const shape = (row) =>
  row
    ? {
        id: row.id,
        kind: row.kind,
        level: row.level,
        title: row.title,
        body: row.body,
        link: row.link || "",
        conversationId: row.conversation_id || null,
        read: Boolean(row.read_at),
        readAt: row.read_at,
        emailStatus: row.email_status || "",
        pushStatus: row.push_status || "",
        createdAt: row.created_at,
      }
    : null;

export async function unreadCount(userId) {
  const row = await one(
    "select count(*)::int as count from notifications where user_id = $1 and read_at is null",
    [userId]
  );
  return Number(row?.count || 0);
}
