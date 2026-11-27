/* Credit-calculation checks for SBD AI Solutions.
 *
 * These run against a throwaway PGlite database and the pure pricing helpers,
 * so they never touch a real customer balance. Run with:
 *   node scripts/credit-tests.mjs
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(`.data/credit-tests-${Date.now()}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dir), { recursive: true });

/* Must be set before the app modules read the environment. */
process.env.PGLITE_DIR = dir;
process.env.OPENAI_MODEL = "gpt-6-luna";
delete process.env.OPENAI_INPUT_PRICE_PER_M;
delete process.env.OPENAI_OUTPUT_PRICE_PER_M;
delete process.env.OPENAI_CACHED_INPUT_PRICE_PER_M;
process.env.NODE_ENV = "test";

const { query, one, closeDb, getImplementation } = await import("../server/db.js");
const { costInDollars, creditsFor, aiAllowanceError } = await import("../server/plans.js");
const { recordAiCost } = await import("../server/ai.js");
const { activatePayment } = await import("../server/payments.js");
const { openaiPrices, openaiPricesConfigured } = await import("../server/env.js");

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${error.message}`);
  }
};
const testAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${error.message}`);
  }
};
const near = (actual, expected, message, tolerance = 1e-9) => {
  if (Math.abs(Number(actual) - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
};

/* ---------- schema + fixtures ---------- */

const schema = fs.readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8");
const statements = schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const db = await getImplementation();
for (const statement of statements) await db.query(statement);

const newUser = async (email) =>
  one(
    `insert into users (full_name, email, password_hash)
     values ($1, $2, 'not-a-real-hash') returning *`,
    [email.split("@")[0], email]
  );

const alice = await newUser("alice@credit.test");
const bob = await newUser("bob@credit.test");
for (const user of [alice, bob]) {
  await query("insert into subscriptions (user_id, plan_id) values ($1, 'starter')", [user.id]);
}

const sub = (user) => one("select * from subscriptions where user_id = $1", [user.id]);

/* A usage object costing exactly `dollars` at the short-context rates. Input
   and output are combined so the prompt stays below the 272k long-context
   threshold (a 500k-token prompt is correctly billed at the higher tier). */
const usageForDollars = (dollars) => {
  const promptDollars = Math.min(dollars * 0.4, 0.02);
  return {
    prompt_tokens: Math.round((promptDollars / openaiPrices.inputPricePerM) * 1_000_000),
    completion_tokens: Math.round(
      ((dollars - promptDollars) / openaiPrices.outputPricePerM) * 1_000_000
    ),
  };
};

/* ---------- verified pricing ---------- */

console.log(`\nModel ${openaiPrices.model}: input=$${openaiPrices.inputPricePerM} ` +
  `cached=$${openaiPrices.cachedInputPricePerM} output=$${openaiPrices.outputPricePerM} ` +
  `source=${openaiPrices.source}\n`);

test("verified model prices are available for gpt-6-luna", () => {
  if (!openaiPricesConfigured) throw new Error("prices are not configured");
  near(openaiPrices.inputPricePerM, 0.1, "input price");
  near(openaiPrices.cachedInputPricePerM, 0.01, "cached input price");
  near(openaiPrices.outputPricePerM, 0.5, "output price");
});

/* ---------- approved conversion ---------- */

test("$0.01 actual cost = exactly 10 SBD credits", () => {
  const dollars = costInDollars(usageForDollars(0.01), openaiPrices);
  near(dollars, 0.01, "dollars");
  near(creditsFor(dollars), 10, "credits");
});

test("$0.05 actual cost = exactly 50 SBD credits", () => {
  const dollars = costInDollars(usageForDollars(0.05), openaiPrices);
  near(creditsFor(dollars), 50, "credits");
});

test("$1.00 actual cost = exactly 1,000 SBD credits", () => {
  const dollars = costInDollars(usageForDollars(1), openaiPrices);
  near(creditsFor(dollars), 1000, "credits");
});

test("input and output tokens are priced separately", () => {
  const usage = { prompt_tokens: 50_000, completion_tokens: 10_000 };
  const dollars = costInDollars(usage, openaiPrices);
  near(dollars, 0.005 + 0.005, "dollars");
  near(creditsFor(dollars), 10, "credits");
  /* Only output: 10,000 * $0.50/1M = $0.005. */
  near(costInDollars({ prompt_tokens: 0, completion_tokens: 10_000 }, openaiPrices), 0.005, "output only");
  /* Only input: 50,000 * $0.10/1M = $0.005. */
  near(costInDollars({ prompt_tokens: 50_000, completion_tokens: 0 }, openaiPrices), 0.005, "input only");
});

test("cached input tokens use the cached rate from prompt_tokens_details", () => {
  const usage = {
    prompt_tokens: 200_000,
    completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 100_000 },
  };
  /* 100k fresh * $0.10/1M + 100k cached * $0.01/1M = 0.01 + 0.001 */
  near(costInDollars(usage, openaiPrices), 0.011, "dollars");
  near(creditsFor(costInDollars(usage, openaiPrices)), 11, "credits");
});

test("reasoning tokens are not billed twice", () => {
  const usage = {
    prompt_tokens: 1_000,
    completion_tokens: 1_000,
    completion_tokens_details: { reasoning_tokens: 600 },
  };
  near(costInDollars(usage, openaiPrices), 0.0001 + 0.0005, "dollars");
});

test("long-context inputs use the long-context rate", () => {
  /* 300k prompt tokens is above the 272k threshold: $0.20 / 1M input. */
  const usage = { prompt_tokens: 300_000, completion_tokens: 100_000 };
  near(costInDollars(usage, openaiPrices), 0.06 + 0.075, "dollars");
});

/* ---------- ledger, idempotency, limits ---------- */

await testAsync("a completed request is charged once and recorded in the ledger", async () => {
  const before = Number((await sub(alice)).credits_used);
  const result = await recordAiCost(alice.id, usageForDollars(0.01), { key: "t-charge-1", source: "test" });
  if (!result.charged) throw new Error(`not charged: ${result.reason}`);
  near(result.credits, 10, "credits returned");
  const after = Number((await sub(alice)).credits_used);
  near(after - before, 10, "credit delta");
  const ledger = await one(
    "select * from ai_usage_events where user_id = $1 and idempotency_key = $2",
    [alice.id, "t-charge-1"]
  );
  if (!ledger) throw new Error("ledger row missing");
  near(Number(ledger.cost_usd), 0.01, "ledger cost");
  near(Number(ledger.credits), 10, "ledger credits");
});

await testAsync("a failed request (no usage) is never charged", async () => {
  const before = Number((await sub(alice)).credits_used);
  const result = await recordAiCost(alice.id, null, { key: "t-failed" });
  if (result.charged) throw new Error("a request without usage was charged");
  near(Number((await sub(alice)).credits_used), before, "credits unchanged");
  const rows = await query("select 1 from ai_usage_events where idempotency_key = 't-failed'");
  if (rows.length) throw new Error("ledger row written for a failed request");
});

await testAsync("a retried request with the same key is only deducted once", async () => {
  const before = Number((await sub(alice)).credits_used);
  const first = await recordAiCost(alice.id, usageForDollars(0.05), { key: "t-duplicate" });
  const second = await recordAiCost(alice.id, usageForDollars(0.05), { key: "t-duplicate" });
  if (!first.charged || first.reason === "duplicate") throw new Error("first request was not charged");
  if (second.charged || second.reason !== "duplicate") throw new Error("duplicate was charged again");
  near(Number((await sub(alice)).credits_used) - before, 50, "single 50-credit deduction");
});

await testAsync("a balance can reach its limit but never exceed it", async () => {
  await query("update subscriptions set credits_used = 2995 where user_id = $1", [alice.id]);
  await recordAiCost(alice.id, usageForDollars(0.01), { key: "t-limit" });
  near(Number((await sub(alice)).credits_used), 3000, "clamped at the 3,000-credit limit");
  const blocked = await aiAllowanceError(alice.id);
  if (!blocked || blocked.code !== "CREDITS_EXHAUSTED") {
    throw new Error(`exhausted account was not blocked: ${JSON.stringify(blocked)}`);
  }
  /* Even if a second operation slips through to the charge step, the balance
     stays clamped at the limit — never over it, never negative. */
  await recordAiCost(alice.id, usageForDollars(0.01), { key: "t-limit-2" });
  near(Number((await sub(alice)).credits_used), 3000, "still no negative or over-limit balance");
});

await testAsync("the internal spending cap is enforced alongside credits", async () => {
  await query(
    "update subscriptions set credits_used = 0, spending_used = 2.999 where user_id = $1",
    [bob.id]
  );
  await recordAiCost(bob.id, usageForDollars(0.01), { key: "t-cap" });
  near(Number((await sub(bob)).spending_used), 3, "clamped at the $3 Starter cap");
  const blocked = await aiAllowanceError(bob.id);
  if (!blocked || blocked.code !== "SPENDING_LIMIT") {
    throw new Error(`spending cap not enforced: ${JSON.stringify(blocked)}`);
  }
});

await testAsync("one customer's usage never changes another customer's balance", async () => {
  const bobRow = await sub(bob);
  const aliceRow = await sub(alice);
  near(Number(bobRow.credits_used), 10, "bob keeps his own credits");
  near(Number(aliceRow.credits_used), 3000, "alice keeps her own credits");
  const bobEvents = await query("select 1 from ai_usage_events where user_id = $1 and idempotency_key = 't-limit'", [bob.id]);
  if (bobEvents.length) throw new Error("alice's usage leaked into bob's ledger");
});

await testAsync("a verified renewal resets credits and spending", async () => {
  const payment = await one(
    `insert into payments (user_id, plan_id, amount, status, method, description, reference)
     values ($1, 'professional', 35, 'pending', 'transfer', 'credit test', $2) returning *`,
    [bob.id, `CREDIT-TEST-${Date.now()}`]
  );
  await activatePayment(payment, { method: "transfer" });
  const renewed = await sub(bob);
  near(Number(renewed.credits_used), 0, "credits reset");
  near(Number(renewed.spending_used), 0, "spending reset");
  if (renewed.plan_id !== "professional") throw new Error("plan was not activated");
});

await closeDb();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
