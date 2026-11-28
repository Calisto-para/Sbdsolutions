import crypto from "node:crypto";
import { env } from "./env.js";

/* Firebase Cloud Messaging (HTTP v1).
 *
 * Sending a push needs a short-lived OAuth token minted from the service
 * account, and the service-account private key must never reach the browser.
 * Everything here is server-only; the frontend receives just the public web
 * config (API key, project id, app id, sender id and the VAPID key).
 *
 * No firebase-admin dependency: the token is a standard signed JWT, which
 * node:crypto can produce. That keeps the deploy small and avoids a second
 * credential system.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const privateKey = () =>
  String(env.firebase.privateKey || "").replace(/\\n/g, "\n").trim();

export const pushConfigured = () =>
  Boolean(
    env.firebase.projectId &&
      env.firebase.clientEmail &&
      privateKey() &&
      env.firebase.vapidKey
  );

/* The browser only ever receives these public values. */
export function pushPublicConfig() {
  return {
    enabled: pushConfigured(),
    config: pushConfigured()
      ? {
          apiKey: env.firebase.apiKey,
          authDomain: `${env.firebase.projectId}.firebaseapp.com`,
          projectId: env.firebase.projectId,
          messagingSenderId: env.firebase.senderId,
          appId: env.firebase.appId,
        }
      : null,
    vapidKey: env.firebase.vapidKey || "",
    /* iOS needs the site added to the Home Screen before web push exists. */
    notes: {
      https: "Phone notifications need the site to be served over HTTPS.",
      ios: "On iPhone or iPad, open the site in Safari, tap Share, then Add to Home Screen. Open it from the Home Screen before enabling notifications.",
    },
  };
}

let cached = { token: "", expiresAt: 0 };

const base64url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function accessToken() {
  if (!pushConfigured()) throw new Error("Push notifications are not configured.");
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.expiresAt > now + 60) return cached.token;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: env.firebase.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(privateKey())
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || `Google rejected the service account (HTTP ${response.status}).`);
  }
  cached = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
  };
  return cached.token;
}

/* A token the install no longer owns. It is removed from the account so the
   owner is not notified into a void. */
const isGone = (status, body) =>
  status === 404 ||
  /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(String(body?.error?.status || "")) ||
  /registration token is not a valid/i.test(String(body?.error?.message || ""));

/**
 * Send one notification to many devices.
 * Returns { sent, failed, invalid: [tokens], detail } and never throws for a
 * single device failure: a bad token must not lose the notification for the
 * owner's other phones.
 */
export async function sendPush(tokens, payload) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length) return { sent: 0, failed: 0, invalid: [], detail: "no devices" };
  if (!pushConfigured()) return { sent: 0, failed: 0, invalid: [], detail: "not configured" };

  let token;
  try {
    token = await accessToken();
  } catch (error) {
    console.error(`[push] ${error.message}`);
    return { sent: 0, failed: list.length, invalid: [], detail: error.message };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
    env.firebase.projectId
  )}/messages:send`;

  let sent = 0;
  let failed = 0;
  const invalid = [];
  const failures = [];

  /* Small batches: FCM allows plenty of concurrency, but a burst of hundreds
     of devices should not open hundreds of sockets at once. */
  for (let i = 0; i < list.length; i += 10) {
    const batch = list.slice(i, i + 10);
    await Promise.all(
      batch.map(async (deviceToken) => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: deviceToken,
                notification: {
                  title: payload.title,
                  body: payload.body,
                },
                data: Object.fromEntries(
                  Object.entries(payload.data || {}).map(([key, value]) => [key, String(value ?? "")])
                ),
                webpush: {
                  fcm_options: { link: payload.link || "/dashboard" },
                  notification: {
                    icon: "/brand/sbd-solutions-mark.png",
                    badge: "/brand/sbd-solutions-mark.png",
                    tag: payload.tag || "sbd",
                    /* Lock-screen previews never carry visitor message text. */
                    body: payload.body,
                    requireInteraction: Boolean(payload.requireInteraction),
                  },
                },
              },
            }),
            signal: AbortSignal.timeout(15000),
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok) {
            sent += 1;
            return;
          }
          failed += 1;
          failures.push(`${response.status} ${body?.error?.status || ""}`.trim());
          if (isGone(response.status, body)) invalid.push(deviceToken);
        } catch (error) {
          failed += 1;
          failures.push(error.message);
        }
      })
    );
  }

  return { sent, failed, invalid, detail: failures.slice(0, 3).join(" | ") };
}
