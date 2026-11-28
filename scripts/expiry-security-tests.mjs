import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { one, query } from "../server/db.js";

const base = "http://127.0.0.1:3114";
const stamp = Date.now();
const adminEmail = `ex-admin-${stamp}@example.com`;
const customerEmail = `ex-customer-${stamp}@example.com`;
const password = "Str0ngPass!23";
const hash = await bcrypt.hash(password, 10);
for (const [email, name, role] of [[adminEmail, "EX Admin", "admin"], [customerEmail, "EX Customer", "client"]]) {
  await one(
    `insert into users (full_name, email, phone, country, password_hash, role, email_verified_at)
     values ($1,$2,'+2348000000000','Nigeria',$3,$4,now())
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
const start = async () => {
  child = spawn("node", ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: "3114" }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + "/api/health"); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
};
const stop = async () => {
  if (child) child.kill();
  child = null;
  /* Wait until the port is actually free: a still-running old process would
     answer with its cached database snapshot and hide the lapse. */
  for (let i = 0; i < 20; i++) {
    try { await fetch(base + "/api/health"); await new Promise((r) => setTimeout(r, 300)); }
    catch { return; }
  }
};
function session() {
  let cookie = "";
  return async (path, options = {}) => {
    const res = await fetch(base + path, {
      ...options,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: res.status, body };
  };
}

try {
  await start();
  const admin = session();
  const customer = session();
  const adminLogin = await admin("/api/auth/login", { method: "POST", body: JSON.stringify({ email: adminEmail, password }) });
  const customerLogin = await customer("/api/auth/login", { method: "POST", body: JSON.stringify({ email: customerEmail, password }) });
  check("admin login", adminLogin.status === 200, `HTTP ${adminLogin.status} ${JSON.stringify(adminLogin.body).slice(0, 80)}`);
  check("customer login", customerLogin.status === 200, `HTTP ${customerLogin.status}`);

  const request = await customer("/api/custom-requests", { method: "POST", body: JSON.stringify({
    kind: "subscription", product: "Website chatbot", title: "Expiry agreement", email: customerEmail,
    requirements: "Custom agreement used to verify the expiry fallback behaviour.",
  }) });
  const requestId = request.body.request?.id;
  check("request created", Boolean(requestId), `HTTP ${request.status} ${JSON.stringify(request.body).slice(0, 100)}`);
  const offer = await admin(`/api/admin/custom-requests/${requestId}/offers`, { method: "POST", body: JSON.stringify({
    name: "Expiry Custom", price: 50, billingPeriod: "monthly", credits: 20000, customerLimit: 9, websiteLimit: 3,
  }) });
  const offerId = offer.body.offer?.id;
  check("offer created", Boolean(offerId), `HTTP ${offer.status} ${JSON.stringify(offer.body).slice(0, 100)}`);
  const accept = await customer(`/api/custom-requests/${requestId}/offers/${offerId}/respond`, { method: "POST", body: JSON.stringify({ action: "accept" }) });
  const paymentId = accept.body.payment?.id;
  check("offer accepted", Boolean(paymentId), `HTTP ${accept.status} ${JSON.stringify(accept.body).slice(0, 100)}`);
  const verified = await admin(`/api/admin/payments/${paymentId}/verify`, { method: "POST", body: "{}" });
  check("payment verified", verified.status === 200, `HTTP ${verified.status} ${JSON.stringify(verified.body).slice(0, 120)}`);

  const active = await customer("/api/usage");
  check("custom plan active after payment", active.body.plan?.id?.startsWith("custom-") && active.body.active === true, `${active.body.plan?.id}/${active.body.active}`);

  /* Foreign-Origin mutation must be refused before it reaches a route. */
  const foreign = await fetch(base + "/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } });
  check("foreign-origin write refused", foreign.status === 403, `HTTP ${foreign.status}`);
  const sameOrigin = await fetch(base + "/api/notifications/read", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{}",
  });
  check("same-origin write allowed", sameOrigin.status !== 403, `HTTP ${sameOrigin.status}`);

  /* Let the paid period lapse in the database, then restart so the server
     reads the new row rather than its cached snapshot. */
  await stop();
  /* A fresh process reads the committed row, not this script's older
     snapshot; the update is the same one an operator would make. */
  execFileSync("node", ["-e", `
    import("./server/db.js").then(async ({ query }) => {
      const rows = await query("update subscriptions set current_period_end = now() - interval '1 day' where user_id = (select id from users where email = $1) returning current_period_end", ["${customerEmail}"]);
      if (!rows.length) { console.error("no subscription lapsed"); process.exit(2); }
      process.exit(0);
    });`], { cwd: process.cwd(), stdio: "inherit" });
  await start();

  const lapsed = await customer("/api/usage");
  check("lapsed custom period falls back", lapsed.body.plan?.id === "starter", lapsed.body.plan?.id);
  check("lapsed plan is not shown as active", lapsed.body.active === false, String(lapsed.body.active));
  check("fallback credit allowance is finite", lapsed.body.credits?.allowance === 3000, lapsed.body.credits?.allowance);
  check("fallback agent allowance restored", lapsed.body.agents?.limit === 1, lapsed.body.agents?.limit);
  check("usage totals preserved", lapsed.body.credits?.used === active.body.credits?.used);

  const agents = await customer("/api/live/conversations?filter=all");
  check("inbox still readable after fallback", agents.status === 200, `HTTP ${agents.status}`);
} catch (error) {
  console.log("FAIL harness —", error.message);
  failures += 1;
} finally {
  await stop();
}
console.log(failures === 0 ? "ALL EXPIRY & SECURITY CHECKS PASSED" : `${failures} FAILURE(S)`);
setTimeout(() => process.exit(failures ? 1 : 0), 300);
