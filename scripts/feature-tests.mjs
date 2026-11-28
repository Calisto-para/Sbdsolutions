/* Feature checks for subscription usage monitoring, extra credits, upgrades,
 * payment webhook signing, notifications and live human takeover.
 *
 * Phase 1 runs against a throwaway PGlite database and the real server modules.
 * Phase 2 boots the real Express server on a random port with its own throwaway
 * database and drives the live-chat HTTP API end to end.
 *
 * Run with: node scripts/feature-tests.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const stamp = Date.now();
const dir = path.resolve(`.data/feature-tests-${stamp}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dir), { recursive: true });

process.env.PGLITE_DIR = dir;
process.env.NODE_ENV = "test";
process.env.OPENAI_MODEL = "gpt-6-luna";
delete process.env.OPENAI_INPUT_PRICE_PER_M;
delete process.env.OPENAI_OUTPUT_PRICE_PER_M;
delete process.env.OPENAI_CACHED_INPUT_PRICE_PER_M;
/* No real provider, email or push credentials are used by these checks. */
process.env.PAYSTACK_SECRET_KEY = "";
process.env.FLUTTERWAVE_SECRET_KEY = "";
process.env.BREVO_API_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.SMTP_HOST = "";

const { query, one, closeDb, getImplementation } = await import("../server/db.js");
const { checkCreditLimit, checkTokenLimit, messageAllowanceError } = await import("../server/plans.js");
const {
  activatePayment,
  activatePaymentFromWebhook,
  checkProviderPayment,
  verifyPaystackSignature,
  verifyFlutterwaveSignature,
} = await import("../server/payments.js");
const { usageOverview, syncUsageWarnings, warningText } = await import("../server/usage.js");
const { createNotification, notificationPreferences } = await import("../server/notify.js");
const { aiPaused, normalizeStatus } = await import("../server/livechat.js");
const { upgradeQuote } = await import("../server/routes/subscriptions.js");
const { pushConfigured } = await import("../server/push.js");
const { realtimeStats } = await import("../server/realtime.js");

let passed = 0;
let failed = 0;
const results = [];
const ok = (name, fn) => {
  try {
    fn();
    passed += 1;
    results.push(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    results.push(`FAIL ${name}\n     ${error.message}`);
  }
};
const okAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    results.push(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    results.push(`FAIL ${name}\n     ${error.message}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, message, tolerance = 0.01) => {
  if (Math.abs(Number(actual) - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
};

/* ---------- schema + fixtures ---------- */

const schema = fs.readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8");
const statements = schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const db = await getImplementation();
for (const statement of statements) await db.query(statement);

const newUser = (email, name) =>
  one(
    `insert into users (full_name, email, password_hash) values ($1, $2, 'not-a-real-hash') returning *`,
    [name || email.split("@")[0], email]
  );

const alice = await newUser("alice@feature.test", "Alice");
const bob = await newUser("bob@feature.test", "Bob");
for (const user of [alice, bob]) {
  await query("insert into subscriptions (user_id, plan_id) values ($1, 'starter')", [user.id]);
}
const assistant = await one(
  `insert into assistants (user_id, name, public_key) values ($1, 'Alice Bot', $2) returning *`,
  [alice.id, "a".repeat(24)]
);

/* ---------- usage warning copy at every threshold ---------- */

ok("70% credit warning uses the agreed copy", () => {
  assert(
    warningText("credits", 70) ===
      "Your AI credit usage has reached 70%. Consider monitoring your remaining allowance.",
    warningText("credits", 70)
  );
});
ok("85% credit warning uses the agreed copy", () => {
  assert(warningText("credits", 85).includes("almost exhausted"), warningText("credits", 85));
});
ok("95% credit warning uses the agreed copy", () => {
  assert(warningText("credits", 95).includes("nearly finished"), warningText("credits", 95));
});
ok("100% credit warning uses the agreed copy", () => {
  assert(warningText("credits", 100).includes("reached your monthly AI credit limit"), warningText("credits", 100));
});
ok("unique-customer warnings have their own copy", () => {
  assert(warningText("customers", 70).includes("unique-customer"), warningText("customers", 70));
  assert(warningText("customers", 100).includes("unique-customer limit"), warningText("customers", 100));
});

await okAsync("warnings fire at 70/85/95/100 and are stored once per period", async () => {
  /* Starter: 3,000 credits, 50 customers. 70% = 2,100. */
  await query("update subscriptions set credits_used = 2100 where user_id = $1", [alice.id]);
  let overview = await usageOverview(alice.id);
  near(overview.credits.percent, 70, "70% usage");
  const first = await syncUsageWarnings(alice.id, overview);
  assert(first.length === 1 && first[0].threshold === 70, `expected one 70% warning, got ${JSON.stringify(first)}`);
  const repeat = await syncUsageWarnings(alice.id, overview);
  assert(repeat.length === 0, "a repeated sync must not create the same warning twice");
  const rows = await query("select * from notifications where user_id = $1 and kind = 'usage_warning'", [alice.id]);
  assert(rows.length === 1, `expected 1 stored warning, got ${rows.length}`);

  await query("update subscriptions set credits_used = 2550 where user_id = $1", [alice.id]);
  overview = await usageOverview(alice.id);
  const eightyFive = await syncUsageWarnings(alice.id, overview);
  assert(eightyFive.some((warning) => warning.threshold === 85), "85% warning should fire");

  await query("update subscriptions set credits_used = 2850 where user_id = $1", [alice.id]);
  const ninetyFive = await syncUsageWarnings(alice.id, await usageOverview(alice.id));
  assert(ninetyFive.some((warning) => warning.threshold === 95), "95% warning should fire");

  await query("update subscriptions set credits_used = 3000 where user_id = $1", [alice.id]);
  const full = await syncUsageWarnings(alice.id, await usageOverview(alice.id));
  assert(full.some((warning) => warning.threshold === 100), "100% warning should fire");
  const all = await query("select * from notifications where user_id = $1 and kind = 'usage_warning' order by created_at", [alice.id]);
  assert(all.length === 4, `expected 4 distinct warnings, got ${all.length}`);
});

/* ---------- credit exhaustion ---------- */

await okAsync("credit limit blocks an exhausted account", async () => {
  const blocked = await checkCreditLimit(alice.id);
  assert(blocked.includes("AI credit limit"), `expected the limit message, got: ${blocked}`);
});

await okAsync("purchased credits extend the allowance and are tracked separately", async () => {
  await query("update subscriptions set bonus_credits = 500 where user_id = $1", [alice.id]);
  const overview = await usageOverview(alice.id);
  assert(overview.credits.allowance === 3500, `allowance should be 3,500, got ${overview.credits.allowance}`);
  assert(overview.credits.purchased === 500, "purchased credits should be reported separately");
  const blocked = await checkCreditLimit(alice.id);
  assert(blocked === "", `500 extra credits should lift the block, got: ${blocked}`);
});

/* ---------- unique-customer exhaustion ---------- */

await okAsync("unique-customer limit blocks new customers but not known ones", async () => {
  for (let i = 0; i < 50; i += 1) {
    const conversation = await one(
      `insert into conversations (user_id, assistant_id, channel, visitor_key, title)
       values ($1, $2, 'widget', $3, 'Chat') returning *`,
      [bob.id, assistant.id, `visitor-key-${i}`]
    );
    await query(
      `insert into messages (conversation_id, role, content, author)
       values ($1, 'user', 'hello', 'visitor')`,
      [conversation.id]
    );
  }
  const blocked = await messageAllowanceError(bob.id, "brand-new-visitor");
  assert(blocked.includes("50-customer allowance"), `expected the customer limit message, got: ${blocked}`);
  const known = await messageAllowanceError(bob.id, "visitor-key-9");
  assert(known === "", "an already-counted customer must still be able to continue");
});

/* ---------- upgrade maths and activation ---------- */

ok("upgrade quote charges only the remaining period difference", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const periodEnd = new Date("2026-11-16T00:00:00Z"); /* 15 of 30 days left */
  const quote = upgradeQuote({
    currentPlan: { id: "starter", price: 15 },
    newPlan: { id: "professional", price: 35 },
    periodEnd,
    now,
  });
  near(quote.remainingDays, 15, "remaining days");
  near(quote.unusedValue, 7.5, "unused value");
  near(quote.amountDue, 27.5, "amount due");
  assert(quote.periodEnd.startsWith("2026-11-16"), "billing date must not move");
});

await okAsync("a failed payment never activates the upgrade", async () => {
  const payment = await one(
    `insert into payments (user_id, plan_id, target_plan_id, kind, amount, currency,
                           payment_currency, local_amount, status, method, reference)
     values ($1, 'professional', 'professional', 'upgrade', 27.5, 'USD', 'USD', 27.5,
             'pending', 'flutterwave', 'SBD-UPGRADE-FAIL') returning *`,
    [alice.id]
  );
  const check = checkProviderPayment(payment, {
    amount: 100,
    currency: "USD",
    reference: "SBD-UPGRADE-FAIL",
  });
  assert(check.ok === false && check.code === "AMOUNT_MISMATCH", "a wrong amount must be refused");
  const sub = await one("select * from subscriptions where user_id = $1", [alice.id]);
  assert(sub.plan_id === "starter", "the plan must not change without a verified payment");
});

await okAsync("a verified upgrade changes the plan without resetting usage or the billing date", async () => {
  const before = await one("select * from subscriptions where user_id = $1", [alice.id]);
  const payment = await one(
    `insert into payments (user_id, plan_id, target_plan_id, kind, amount, currency,
                           payment_currency, local_amount, status, method, reference)
     values ($1, 'professional', 'professional', 'upgrade', 27.5, 'USD', 'USD', 27.5,
             'pending', 'flutterwave', 'SBD-UPGRADE-OK') returning *`,
    [alice.id]
  );
  await activatePayment(payment, { method: "flutterwave" });
  const after = await one("select * from subscriptions where user_id = $1", [alice.id]);
  assert(after.plan_id === "professional", `plan should be professional, got ${after.plan_id}`);
  near(after.credits_used, before.credits_used, "used credits must be kept");
  near(after.bonus_credits, before.bonus_credits, "purchased credits must be kept");
  assert(
    new Date(after.current_period_end).getTime() === new Date(before.current_period_end).getTime(),
    "the renewal date must not move on an upgrade"
  );
});

/* ---------- duplicates ---------- */

await okAsync("a duplicate upgrade activation cannot charge or duplicate anything", async () => {
  const paid = await one("select * from payments where reference = 'SBD-UPGRADE-OK'");
  const again = await activatePayment(paid, { method: "flutterwave" });
  assert(again && again.status === "paid", "an already-paid invoice is returned untouched");
  const count = await one(
    "select count(*)::int as count from payments where reference = 'SBD-UPGRADE-OK'"
  );
  assert(count.count === 1, "no extra payment row");
});

await okAsync("extra credits are added exactly once per payment", async () => {
  const pack = await one(
    `insert into credit_packages (name, credits, price, active) values ('Booster', 500, 10, true) returning *`
  );
  const payment = await one(
    `insert into payments (user_id, plan_id, kind, credit_amount, amount, currency,
                           payment_currency, local_amount, status, method, reference)
     values ($1, 'professional', 'credits', 500, 10, 'USD', 'USD', 10, 'pending',
             'flutterwave', 'SBD-CREDITS-1') returning *`,
    [alice.id]
  );
  const before = await one("select bonus_credits from subscriptions where user_id = $1", [alice.id]);
  await activatePayment(payment, { method: "flutterwave" });
  await activatePayment({ ...payment, status: "pending" }, { method: "flutterwave" });
  const after = await one("select bonus_credits from subscriptions where user_id = $1", [alice.id]);
  near(after.bonus_credits, Number(before.bonus_credits) + 500, "credits added once");
  const purchases = await query("select * from credit_purchases where user_id = $1", [alice.id]);
  assert(purchases.length === 1, `expected one purchase row, got ${purchases.length}`);
  assert(pack.credits === 500, "package fixture");
});

await okAsync("a renewal resets plan credits but keeps purchased credits", async () => {
  const renewal = await one(
    `insert into payments (user_id, plan_id, kind, amount, currency, payment_currency,
                           local_amount, status, method, reference)
     values ($1, 'professional', 'plan', 35, 'USD', 'USD', 35, 'pending', 'flutterwave',
             'SBD-RENEW-1') returning *`,
    [alice.id]
  );
  await activatePayment(renewal, { method: "flutterwave" });
  const sub = await one("select * from subscriptions where user_id = $1", [alice.id]);
  near(sub.credits_used, 0, "plan credits reset on renewal");
  assert(Number(sub.bonus_credits) >= 500, "purchased credits survive a renewal");
});

/* ---------- automatic payment acceptance (webhooks) ---------- */

await okAsync("a signed provider event activates a pending plan payment", async () => {
  const payment = await one(
    `insert into payments (user_id, plan_id, amount, currency, payment_currency, local_amount,
                           status, method, reference)
     values ($1, 'starter', 15, 'USD', 'USD', 15, 'pending', 'flutterwave', 'SBD-HOOK-1')
     returning *`,
    [bob.id]
  );
  const result = await activatePaymentFromWebhook(payment, "flutterwave", {
    id: "flw-tx-1",
    tx_ref: "SBD-HOOK-1",
    amount: 15,
    currency: "USD",
    status: "successful",
  });
  assert(result.activated === true, `expected activation, got: ${result.message}`);
  const sub = await one("select plan_id from subscriptions where user_id = $1", [bob.id]);
  assert(sub.plan_id === "starter", "plan stays starter for a starter invoice");
  const paid = await one("select * from payments where reference = 'SBD-HOOK-1'");
  assert(paid.status === "paid", "the invoice is marked paid");
  assert(paid.provider_reference === "flw-tx-1", "the provider transaction id is stored");
});

await okAsync("a webhook with the wrong amount does not activate anything", async () => {
  const payment = await one(
    `insert into payments (user_id, plan_id, target_plan_id, kind, amount, currency,
                           payment_currency, local_amount, status, method, reference)
     values ($1, 'professional', 'professional', 'upgrade', 27.5, 'USD', 'USD', 27.5,
             'pending', 'flutterwave', 'SBD-HOOK-BAD') returning *`,
    [bob.id]
  );
  const result = await activatePaymentFromWebhook(payment, "flutterwave", {
    id: "flw-tx-bad",
    tx_ref: "SBD-HOOK-BAD",
    amount: 1,
    currency: "USD",
    status: "successful",
  });
  assert(result.activated === false, "a wrong amount must not activate");
  const row = await one("select status from payments where reference = 'SBD-HOOK-BAD'");
  assert(row.status === "pending", "the invoice stays pending for reconciliation");
});

await okAsync("one provider transaction cannot pay two invoices", async () => {
  const second = await one(
    `insert into payments (user_id, plan_id, amount, currency, payment_currency, local_amount,
                           status, method, reference)
     values ($1, 'starter', 15, 'USD', 'USD', 15, 'pending', 'flutterwave', 'SBD-HOOK-2')
     returning *`,
    [bob.id]
  );
  const result = await activatePaymentFromWebhook(second, "flutterwave", {
    id: "flw-tx-1",
    tx_ref: "SBD-HOOK-2",
    amount: 15,
    currency: "USD",
    status: "successful",
  });
  assert(result.activated === false, "a reused provider transaction must be refused");
  const row = await one("select status from payments where reference = 'SBD-HOOK-2'");
  assert(row.status === "pending", "the duplicate invoice stays pending");
});

/* ---------- webhook signatures ---------- */

ok("Paystack plain hex signature is verified", () => {
  const secret = "sk_test_webhook";
  const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "SBD-1" } }));
  const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
  assert(verifyPaystackSignature(body, signature, [secret]) === secret, "valid signature should pass");
  assert(verifyPaystackSignature(body, "0".repeat(128), [secret]) === null, "bad signature must fail");
  assert(
    verifyPaystackSignature(Buffer.from(body.toString().replace("SBD-1", "SBD-2")), signature, [secret]) === null,
    "a tampered body must fail"
  );
});

ok("Paystack timestamped signature is verified and stale timestamps are rejected", () => {
  const secret = "sk_test_webhook";
  const body = Buffer.from(JSON.stringify({ event: "charge.success" }));
  const t = 1_800_000_000;
  const sig = crypto.createHmac("sha512", secret).update(`${t}.`).update(body).digest("hex");
  const header = `t=${t},v1=k1:${sig}`;
  assert(verifyPaystackSignature(body, header, [secret], t) === secret, "valid timestamped signature");
  assert(verifyPaystackSignature(body, header, [secret], t + 3600) === null, "stale signature must fail");
});

ok("Flutterwave v4 and v3 signatures are verified", () => {
  const hash = "flw-secret-hash";
  const body = Buffer.from(JSON.stringify({ event: "charge.completed" }));
  const v4 = crypto.createHmac("sha256", hash).update(body).digest("base64");
  assert(verifyFlutterwaveSignature(body, { "flutterwave-signature": v4 }, hash) === true, "v4 base64 HMAC");
  assert(verifyFlutterwaveSignature(body, { "verif-hash": hash }, hash) === true, "v3 hash");
  assert(verifyFlutterwaveSignature(body, { "verif-hash": "wrong" }, hash) === false, "wrong hash rejected");
});

/* ---------- notifications ---------- */

await okAsync("notification history dedupes and honours preferences", async () => {
  const first = await createNotification({
    userId: alice.id,
    kind: "human_request",
    title: "New Human Support Request",
    body: "A visitor is requesting assistance from your business.",
    dedupeKey: "test-human-request-1",
    link: "/dashboard?tab=live",
  });
  assert(first.inserted === true, "first notification should be stored");
  const duplicate = await createNotification({
    userId: alice.id,
    kind: "human_request",
    title: "New Human Support Request",
    body: "again",
    dedupeKey: "test-human-request-1",
  });
  assert(duplicate.inserted === false, "same dedupe key must not create a second row");

  await query(
    `update users set preferences = $2 where id = $1`,
    [alice.id, JSON.stringify({ notifications: { push: false, email: false } })]
  );
  const user = await one("select * from users where id = $1", [alice.id]);
  const prefs = notificationPreferences(user);
  assert(prefs.push === false && prefs.email === false, "preferences must persist");
  const silent = await createNotification({
    userId: alice.id,
    kind: "visitor_message",
    title: "New message from a visitor",
    body: "quiet",
    dedupeKey: "test-quiet-1",
  });
  assert(silent.inserted === true && silent.emailStatus === "skipped", "disabled email must be skipped");
  assert(silent.pushStatus === "skipped", "disabled push must be skipped");
});

ok("push is reported as unconfigured without Firebase keys", () => {
  assert(pushConfigured() === false, "push must not claim to be configured");
});

ok("realtime hub starts empty", () => {
  const stats = realtimeStats();
  assert(stats.owners === 0 && stats.conversations === 0, "no connections should be open");
});

/* ---------- lifecycle helpers ---------- */

ok("AI pauses for a request or an active human", () => {
  assert(aiPaused({ status: "human_requested" }) === true, "human_requested pauses AI");
  assert(aiPaused({ status: "human_active" }) === true, "human_active pauses AI");
  assert(aiPaused({ status: "ai_active" }) === false, "ai_active runs AI");
  assert(aiPaused({ status: "open" }) === false, "legacy open means AI active");
  assert(normalizeStatus("open") === "ai_active", "legacy open normalises");
});

await closeDb();

/* ==========================================================================
   Phase 2 — real server, live-chat HTTP API
   ========================================================================== */

const PORT = 4600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${PORT}`;
const serverDir = path.resolve(`.data/feature-tests-server-${stamp}`);
fs.rmSync(serverDir, { recursive: true, force: true });

const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    PGLITE_DIR: serverDir,
    NODE_ENV: "test",
    APP_URL: base,
    SESSION_SECRET: "feature-test-session-secret",
    ADMIN_EMAILS: "admin@live.test",
    ADMIN_EMAIL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.dbReady) return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server did not become ready:\n${serverLog.slice(-2000)}`);
}

/* A minimal cookie jar: register once per account and keep its session. */
function makeClient() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(pathName, options = {}) {
      const response = await fetch(`${base}${pathName}`, {
        ...options,
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...(options.headers || {}),
        },
      });
      const setCookie = response.headers.getSetCookie?.() || [];
      for (const value of setCookie) {
        const pair = value.split(";")[0];
        if (pair.startsWith("sbd_session=")) cookie = pair;
      }
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }
      return { status: response.status, body };
    },
  };
}

async function register(client, email, name) {
  return client.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: name,
      businessName: `${name} Ltd`,
      email,
      phone: "+2348000000000",
      country: "Nigeria",
      password: "StrongPass123!",
      confirmPassword: "StrongPass123!",
    }),
  });
}

try {
  await waitForServer();

  const ownerA = makeClient();
  const ownerB = makeClient();
  const visitor = makeClient();

  /* Registration issues a verification link; in a test environment with no
     email provider the link is returned so the flow can be completed. */
  async function verifyAndSignIn(client, reg, email) {
    const token = new URL(reg.body.previewUrl).searchParams.get("token");
    const verified = await client.request("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    assert(verified.status === 200, `verify-email failed: ${JSON.stringify(verified.body)}`);
    const login = await client.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "StrongPass123!" }),
    });
    assert(login.status === 200, `login failed: ${JSON.stringify(login.body)}`);
    assert(client.cookie.startsWith("sbd_session="), `${email} must have a session cookie`);
  }

  const regA = await register(ownerA, "owner-a@live.test", "Owner A");
  const regB = await register(ownerB, "owner-b@live.test", "Owner B");
  assert(regA.status === 201 || regA.status === 200, `owner A register failed: ${JSON.stringify(regA.body)}`);
  assert(regB.status === 201 || regB.status === 200, `owner B register failed: ${JSON.stringify(regB.body)}`);
  await verifyAndSignIn(ownerA, regA, "owner-a@live.test");
  await verifyAndSignIn(ownerB, regB, "owner-b@live.test");

  const createdAssistant = await ownerA.request("/api/assistants", {
    method: "POST",
    body: JSON.stringify({ name: "Alice Live Bot" }),
  });
  assert(createdAssistant.status === 201, `assistant create failed: ${JSON.stringify(createdAssistant.body)}`);
  const publicKey = createdAssistant.body.assistant?.publicKey || createdAssistant.body.assistant?.public_key;
  assert(publicKey, "the assistant needs a public key for the widget");

  const widgetConfig = await visitor.request(`/api/widget/${publicKey}`);
  assert(widgetConfig.status === 200, "widget config should load");

  /* A visitor starts a conversation and asks for a person. */
  const conversation = await visitor.request(`/api/widget/${publicKey}/conversation`, {
    method: "POST",
    body: JSON.stringify({ visitorId: "visitor-aaaaaaaa" }),
  });
  assert(conversation.status === 200, `conversation create failed: ${JSON.stringify(conversation.body)}`);
  const conversationId = conversation.body.conversationId;

  const human = await visitor.request(`/api/widget/${publicKey}/conversation/${conversationId}/human`, {
    method: "POST",
    body: JSON.stringify({ visitorId: "visitor-aaaaaaaa" }),
  });
  assert(human.status === 200, `human request failed: ${JSON.stringify(human.body)}`);
  assert(human.body.status === "human_requested", `status should be human_requested, got ${human.body.status}`);
  assert(
    human.body.message ===
      "Your request has been sent to our support team. A human representative will assist you shortly.",
    "visitor-facing message must match the agreed copy"
  );
  assert(typeof human.body.streamToken === "string" && human.body.streamToken.length > 20, "visitor stream token issued");

  /* A different visitor cannot act on this conversation. */
  const intruder = await visitor.request(`/api/widget/${publicKey}/conversation/${conversationId}/human`, {
    method: "POST",
    body: JSON.stringify({ visitorId: "not-the-owner-9999" }),
  });
  assert(intruder.status === 403, `a foreign visitor must be refused, got ${intruder.status}`);

  /* The owner sees the request, with an unread count. */
  const inbox = await ownerA.request("/api/live/conversations?filter=requested");
  assert(inbox.status === 200, "inbox should load");
  const thread = inbox.body.conversations.find((row) => row.id === conversationId);
  assert(thread, "the requested conversation must be in the Human requested filter");
  assert(thread.status === "human_requested", `inbox status, got ${thread.status}`);

  const notifications = await ownerA.request("/api/notifications");
  const humanNotification = notifications.body.notifications.find((row) => row.kind === "human_request");
  assert(humanNotification, "the owner must get a human-request notification");
  assert(
    humanNotification.link.includes(`conversation=${conversationId}`),
    "the notification must link to the exact conversation"
  );

  /* A second business cannot read or touch it. */
  const foreignRead = await ownerB.request(`/api/live/conversations/${conversationId}`);
  assert(foreignRead.status === 404, `another business must get 404, got ${foreignRead.status}`);
  const foreignTakeover = await ownerB.request(`/api/live/conversations/${conversationId}/takeover`, {
    method: "POST",
  });
  assert(foreignTakeover.status === 404, `another business cannot take over, got ${foreignTakeover.status}`);
  const foreignReply = await ownerB.request(`/api/live/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: "I should not be able to send this" }),
  });
  assert(foreignReply.status === 404, `another business cannot send, got ${foreignReply.status}`);

  /* Real-time: the dashboard holds one SSE stream. Takeover and new messages
     must arrive on it without a refresh. */
  const streamController = new AbortController();
  const streamResponse = await fetch(`${base}/api/live/stream`, {
    headers: { cookie: ownerA.cookie },
    signal: streamController.signal,
  });
  assert(streamResponse.status === 200, `SSE stream should open, got ${streamResponse.status}`);
  const sseReader = streamResponse.body.getReader();
  let sseBuffer = "";
  (async () => {
    try {
      for (;;) {
        const { done, value } = await sseReader.read();
        if (done) break;
        sseBuffer += Buffer.from(value).toString("utf8");
      }
    } catch {
      /* aborted at the end of the run */
    }
  })();
  const waitForStream = async (needle, timeout = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (sseBuffer.includes(needle)) return true;
      await sleep(50);
    }
    return false;
  };
  assert(await waitForStream("event: ready"), "the dashboard stream should announce readiness");

  /* Take over. */
  const takeover = await ownerA.request(`/api/live/conversations/${conversationId}/takeover`, {
    method: "POST",
  });
  assert(takeover.status === 200, `takeover failed: ${JSON.stringify(takeover.body)}`);
  assert(takeover.body.conversation.status === "human_active", "status must become human_active");
  assert(
    await waitForStream(`"conversationId":"${conversationId}","status":"human_active"`),
    "the takeover status change must arrive over SSE"
  );

  /* Human reply, then a duplicate send with the same client id. */
  const humanMessage = await ownerA.request(`/api/live/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: "Hello, this is Alice from support.", clientId: "team-msg-0001" }),
  });
  assert(humanMessage.status === 201, `human reply failed: ${JSON.stringify(humanMessage.body)}`);
  assert(
    await waitForStream("Hello, this is Alice from support."),
    "the human reply must be broadcast over SSE"
  );
  const duplicate = await ownerA.request(`/api/live/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: "Hello, this is Alice from support.", clientId: "team-msg-0001" }),
  });
  assert(duplicate.status === 200 && duplicate.body.duplicate === true, "a retried send must not duplicate");

  const visitorView = await visitor.request(`/api/widget/${publicKey}/conversation/${conversationId}`);
  assert(visitorView.status === 200, "visitor can read the conversation");
  const teamMessages = visitorView.body.messages.filter((message) => message.author === "team");
  assert(teamMessages.length === 1, `visitor should see exactly one human reply, saw ${teamMessages.length}`);
  assert(visitorView.body.status === "human_active", "visitor sees the human-active status");
  assert(visitorView.body.streamToken, "conversation payload carries a stream token");

  /* The visitor replies: no AI answer, no AI credits, message delivered. */
  const usageBefore = await ownerA.request("/api/usage");
  const visitorReply = await visitor.request(`/api/widget/${publicKey}/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "Thanks, I have another question.",
      conversationId,
      visitorId: "visitor-aaaaaaaa",
      clientMessageId: "visitor-msg-0001",
    }),
  });
  assert(visitorReply.status === 200, `visitor reply failed: ${JSON.stringify(visitorReply.body)}`);
  assert(visitorReply.body.takeover === true, "the AI must stay paused during takeover");
  const usageAfter = await ownerA.request("/api/usage");
  near(
    Number(usageAfter.body.credits.used),
    Number(usageBefore.body.credits.used),
    "human/takeover messages must not deduct AI credits"
  );
  const afterReply = await ownerA.request(`/api/live/conversations/${conversationId}`);
  const visitorMessages = afterReply.body.messages.filter(
    (message) => message.author === "visitor" && message.content === "Thanks, I have another question."
  );
  assert(visitorMessages.length === 1, "the human inbox receives the visitor reply");

  streamController.abort();

  /* Return control to the AI. */
  const back = await ownerA.request(`/api/live/conversations/${conversationId}/return`, { method: "POST" });
  assert(back.status === 200 && back.body.conversation.status === "ai_active", "return to AI sets ai_active");

  /* Resolve: history kept, out of the active queue. */
  const resolved = await ownerA.request(`/api/live/conversations/${conversationId}/resolve`, { method: "POST" });
  assert(resolved.status === 200 && resolved.body.conversation.status === "resolved", "resolve works");
  const activeList = await ownerA.request("/api/live/conversations?filter=human");
  assert(
    !activeList.body.conversations.some((row) => row.id === conversationId),
    "a resolved conversation leaves the human queue"
  );
  const resolvedDetail = await ownerA.request(`/api/live/conversations/${conversationId}`);
  assert(resolvedDetail.body.messages.length > 0, "history survives resolution");

  /* The visitor cannot continue a resolved conversation. */
  const afterEnd = await visitor.request(`/api/widget/${publicKey}/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "Are you still there?",
      conversationId,
      visitorId: "visitor-aaaaaaaa",
      clientMessageId: "visitor-msg-0002",
    }),
  });
  assert(afterEnd.status === 409, `a resolved chat must be refused, got ${afterEnd.status}`);

  /* Offline enquiry: stored as a lead and visible to the owner. */
  const offlineConversation = await visitor.request(`/api/widget/${publicKey}/conversation`, {
    method: "POST",
    body: JSON.stringify({ visitorId: "visitor-bbbbbbbb" }),
  });
  const offlineId = offlineConversation.body.conversationId;
  const enquiry = await visitor.request(`/api/widget/${publicKey}/conversation/${offlineId}/enquiry`, {
    method: "POST",
    body: JSON.stringify({
      visitorId: "visitor-bbbbbbbb",
      name: "Chidi",
      email: "chidi@example.com",
      phone: "+2348011111111",
      message: "Please call me about pricing.",
    }),
  });
  assert(enquiry.status === 201, `offline enquiry failed: ${JSON.stringify(enquiry.body)}`);
  assert(
    enquiry.body.message === "Thank you — your details are with the team and we will get back to you.",
    "offline confirmation copy"
  );
  const leads = await ownerA.request("/api/leads");
  const lead = leads.body.leads.find((row) => row.email === "chidi@example.com");
  assert(lead, "the offline enquiry must appear in Leads");
  assert(lead.source === "website_offline", `lead source should be website_offline, got ${lead.source}`);
  assert(lead.conversationId === offlineId, "the lead keeps its conversation");

  /* Notification preferences and the centre. */
  const prefs = await ownerA.request("/api/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify({ push: false, humanRequests: false }),
  });
  assert(prefs.status === 200 && prefs.body.preferences.push === false, "preferences can be changed");
  const readAll = await ownerA.request("/api/notifications/read-all", { method: "POST" });
  assert(readAll.status === 200 && readAll.body.unread === 0, "mark all as read works");

  /* Push endpoints refuse cleanly when Firebase is not configured. */
  const pushConfig = await ownerA.request("/api/notifications/push/config");
  assert(pushConfig.status === 200 && pushConfig.body.enabled === false, "push config is public and disabled");
  const pushTest = await ownerA.request("/api/notifications/push/test", { method: "POST" });
  assert(
    pushTest.status === 503 && pushTest.body.code === "PUSH_NOT_CONFIGURED",
    `push test should refuse cleanly, got ${pushTest.status}`
  );

  /* The operator configures credit packs; the customer can then buy one. */
  const admin = makeClient();
  const regAdmin = await register(admin, "admin@live.test", "Admin");
  assert(regAdmin.status === 201 || regAdmin.status === 200, "admin register failed");
  const adminLogin = await admin.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@live.test", password: "StrongPass123!" }),
  });
  assert(adminLogin.status === 200, `allowlisted operator sign-in failed: ${JSON.stringify(adminLogin.body)}`);
  assert(adminLogin.body.user.role === "admin", "the allowlisted account must be an operator");

  const createPack = await admin.request("/api/admin/credit-packages", {
    method: "POST",
    body: JSON.stringify({ name: "Booster", credits: 5000, price: 12.5 }),
  });
  assert(createPack.status === 201, `credit pack create failed: ${JSON.stringify(createPack.body)}`);
  const packId = createPack.body.package.id;

  const usageWithPack = await ownerA.request("/api/usage");
  const visiblePack = usageWithPack.body.creditPackages.find((pack) => pack.id === packId);
  assert(visiblePack, "the configured pack must appear in the customer dashboard");
  assert(visiblePack.credits === 5000, "the operator's credit amount is used verbatim");

  const purchaseUnconfigured = await ownerA.request(
    `/api/subscriptions/credits/${packId}/purchase`,
    { method: "POST", body: JSON.stringify({ country: "US" }) }
  );
  assert(
    purchaseUnconfigured.status === 503 && purchaseUnconfigured.body.code === "PAYMENT_NOT_CONFIGURED",
    `a configured pack refuses checkout without a payment provider, got ${purchaseUnconfigured.status}`
  );

  /* Credit purchases stay disabled until an operator configures a pack. */
  const packagesNow = await ownerA.request("/api/usage");
  assert(
    packagesNow.body.creditPackages.length === 1,
    "exactly the operator-configured pack is offered"
  );
  const purchaseBlocked = await ownerA.request(
    `/api/subscriptions/credits/00000000-0000-0000-0000-000000000000/purchase`,
    { method: "POST", body: JSON.stringify({ country: "NG" }) }
  );
  assert(purchaseBlocked.status === 404, "an unknown pack cannot be bought");

  /* Upgrade quote is server-calculated and transparent. */
  const quote = await ownerA.request("/api/subscriptions/upgrade-quote?planId=professional&country=US");
  assert(quote.status === 200, `upgrade quote failed: ${JSON.stringify(quote.body)}`);
  assert(Number(quote.body.quote.amountDue) > 0, "upgrade quote must have an amount due");
  assert(quote.body.quote.periodEnd, "upgrade quote must state the billing date");
  const downgrade = await ownerA.request("/api/subscriptions/upgrade", {
    method: "POST",
    body: JSON.stringify({ planId: "starter", country: "US" }),
  });
  assert(downgrade.status === 400 && downgrade.body.code === "NOT_AN_UPGRADE", "downgrades are refused");

  results.push("\nLive chat end-to-end checks passed.");
} catch (error) {
  failed += 1;
  results.push(`FAIL live-chat HTTP checks\n     ${error.message}`);
} finally {
  child.kill("SIGTERM");
  await sleep(500);
}

console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
