import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { one } from "../server/db.js";

const base = "http://127.0.0.1:3112";
const stamp = Date.now();
const adminEmail = `ce-admin-${stamp}@example.com`;
const customerEmail = `ce-customer-${stamp}@example.com`;
const password = "Str0ngPass!23";
const hash = await bcrypt.hash(password, 10);

for (const [email, name, role] of [
  [adminEmail, "CE Admin", "admin"],
  [customerEmail, "CE Customer", "client"],
]) {
  await one(
    `insert into users (full_name, email, phone, country, password_hash, role, email_verified_at)
     values ($1, $2, '+2348000000000', 'Nigeria', $3, $4, now())
     on conflict (email) do update set role = excluded.role, email_verified_at = now()`,
    [name, email, hash, role]
  );
}

let child;
let failures = 0;
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
};

function session() {
  let cookie = "";
  return async (path, options = {}) => {
    const res = await fetch(base + path, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(options.headers || {}),
      },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: res.status, body };
  };
}
const anon = session();

try {
  child = spawn("node", ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "3112" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + "/api/health"); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }

  const admin = session();
  const customer = session();
  check("admin login", (await admin("/api/auth/login", { method: "POST", body: JSON.stringify({ email: adminEmail, password }) })).status === 200);
  check("customer login", (await customer("/api/auth/login", { method: "POST", body: JSON.stringify({ email: customerEmail, password }) })).status === 200);

  const before = await customer("/api/usage");
  check("starts on standard plan", before.body.plan?.id === "starter", before.body.plan?.id);

  const created = await customer("/api/custom-requests", { method: "POST", body: JSON.stringify({
    kind: "subscription", product: "Website chatbot", title: "Custom Growth agreement", email: customerEmail,
    requirements: "We need a bespoke allowance of credits, customers and AI agents for our agency.",
  }) });
  const requestId = created.body.request?.id;
  check("request submitted", created.status === 201, `HTTP ${created.status}`);

  const offerRes = await admin(`/api/admin/custom-requests/${requestId}/offers`, { method: "POST", body: JSON.stringify({
    name: "Custom Growth", description: "Bespoke monthly agreement", price: 120, billingPeriod: "monthly",
    credits: 40000, customerLimit: 7, websiteLimit: 2, includedFeatures: "Priority support",
  }) });
  const offerId = offerRes.body.offer?.id;
  check("offer sent", offerRes.status === 201, `HTTP ${offerRes.status}`);

  const accepted = await customer(`/api/custom-requests/${requestId}/offers/${offerId}/respond`, { method: "POST", body: JSON.stringify({ action: "accept" }) });
  const paymentId = accepted.body.payment?.id;
  check("accepted with invoice", accepted.status === 200 && paymentId, accepted.body.message);

  const afterAccept = await customer("/api/usage");
  check("acceptance alone grants nothing", afterAccept.body.plan?.id === "starter", afterAccept.body.plan?.id);

  const firstAgent = await customer("/api/assistants", { method: "POST", body: JSON.stringify({ name: "Agent one" }) });
  check("one agent allowed on starter", firstAgent.status === 201, `HTTP ${firstAgent.status}`);
  const blockedOnStarter = await customer("/api/assistants", { method: "POST", body: JSON.stringify({ name: "Agent two" }) });
  check("second agent blocked before activation", blockedOnStarter.status === 403, `HTTP ${blockedOnStarter.status}`);

  const verify = await admin(`/api/admin/payments/${paymentId}/verify`, { method: "POST", body: "{}" });
  check("payment verified", verify.status === 200, `HTTP ${verify.status}`);

  const active = await customer("/api/usage");
  check("custom plan is active", active.body.plan?.custom === true && active.body.plan?.name === "Custom Growth", JSON.stringify(active.body.plan));
  check("credit allowance applied", active.body.credits?.allowance === 40000, active.body.credits?.allowance);
  check("customer allowance applied", active.body.customers?.limit === 7, active.body.customers?.limit);
  check("AI agent allowance applied", active.body.agents?.limit === 2, active.body.agents?.limit);
  check("renewal date in the future", new Date(active.body.renewalDate) > new Date(), active.body.renewalDate);

  const secondAgent = await customer("/api/assistants", { method: "POST", body: JSON.stringify({ name: "Agent two" }) });
  check("second agent allowed by custom plan", secondAgent.status === 201, `HTTP ${secondAgent.status}`);
  const thirdAgent = await customer("/api/assistants", { method: "POST", body: JSON.stringify({ name: "Agent three" }) });
  check("third agent blocked by custom limit", thirdAgent.status === 403, `HTTP ${thirdAgent.status}`);

  const replay = await admin(`/api/admin/payments/${paymentId}/verify`, { method: "POST", body: "{}" });
  check("payment replay refused", replay.status >= 400, `HTTP ${replay.status}`);
  const afterReplay = await customer("/api/usage");
  check("no duplicate credit grant", afterReplay.body.credits?.purchased === 0 && afterReplay.body.credits?.allowance === 40000, JSON.stringify(afterReplay.body.credits));

  const expire = await admin(`/api/admin/subscriptions/${active.body.userId || (await one("select id from users where email = $1", [customerEmail])).id}`, { method: "PATCH", body: JSON.stringify({ status: "expired" }) });
  check("admin can expire subscription", expire.status === 200, `HTTP ${expire.status}`);

  const fallback = await customer("/api/usage");
  check("expired custom plan falls back", fallback.body.plan?.id === "starter" && fallback.body.plan?.custom === false, JSON.stringify(fallback.body.plan));
  check("fallback is not unlimited", fallback.body.credits?.allowance === 3000, fallback.body.credits?.allowance);
  check("usage history preserved", fallback.body.credits?.used === active.body.credits?.used, `${fallback.body.credits?.used}`);
  const blockedAfterExpiry = await customer("/api/assistants", { method: "POST", body: JSON.stringify({ name: "Agent four" }) });
  check("custom allowances no longer apply after expiry", blockedAfterExpiry.status === 403, `HTTP ${blockedAfterExpiry.status}`);

  const adminList = await admin("/api/admin/users?q=" + encodeURIComponent(customerEmail));
  const customerId = adminList.body.users?.[0]?.id;
  if (!customerId) throw new Error("customer id not found");
  await admin(`/api/admin/subscriptions/${customerId}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
  const restored = await customer("/api/usage");
  check("reactivation restores custom entitlements", restored.body.plan?.custom === true && restored.body.credits?.allowance === 40000, JSON.stringify(restored.body.plan));
} catch (error) {
  console.log("FAIL harness —", error.message);
  failures += 1;
} finally {
  if (child) child.kill();
}
console.log(failures === 0 ? "ALL CUSTOM ENTITLEMENT CHECKS PASSED" : `${failures} FAILURE(S)`);
setTimeout(() => process.exit(failures === 0 ? 0 : 1), 300);
