import { spawn } from "node:child_process";
import { query, one } from "/workspace/chats/21938d94d4d10cfd2777471b/server/db.js";

const base = "http://127.0.0.1:3111";
const email = `phase5-${Date.now()}@example.com`;
let cookie = "";
const call = async (path, options = {}, useCookie = cookie) => {
  const res = await fetch(base + path, {
    ...options,
    headers: { "content-type": "application/json", ...(useCookie ? { cookie: useCookie } : {}), ...(options.headers || {}) },
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body };
};
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
};

let child;
/* The next test binds another port but shares the database file, so the
   previous server must be gone before this script finishes. */
async function waitForPortFree() {
  for (let i = 0; i < 30; i++) {
    try { await fetch("http://127.0.0.1:3111/api/health"); await new Promise((r) => setTimeout(r, 200)); }
    catch { return; }
  }
}
try {
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash("Str0ngPass!23", 10);
  const user = await one(
    `insert into users (full_name, business_name, email, phone, country, password_hash, role, email_verified_at)
     values ('Phase Five Admin', 'P5 Ltd', $1, '+2348000000000', 'Nigeria', $2, 'admin', now())
     on conflict (email) do update set role = 'admin', email_verified_at = now()
     returning id`,
    [email, hash]
  );
  check("seeded verified admin", Boolean(user?.id), email);

  child = spawn("node", ["server/index.js"], { cwd: "/workspace/chats/21938d94d4d10cfd2777471b", env: { ...process.env, PORT: "3111" }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + "/api/health"); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }

  const login = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "Str0ngPass!23" }) }, "");
  check("login as admin", login.status === 200 && cookie, `HTTP ${login.status}`);
  const adminCookie = cookie;

  const create = await call("/api/custom-requests", { method: "POST", body: JSON.stringify({
    kind: "subscription", product: "Website chatbot", title: "Five websites with 40k credits",
    email, requirements: "We need five websites with forty thousand shared credits and priority support.", expectedUsage: "40k credits", budget: "$120/month",
  }) });
  check("customer submits request", create.status === 201, `HTTP ${create.status}`);
  const requestId = create.body.request?.id;

  const badOffer = await call(`/api/admin/custom-requests/${requestId}/offers`, { method: "POST", body: JSON.stringify({ name: "x", price: 0 }) }, adminCookie);
  check("invalid offer rejected", badOffer.status === 400, `HTTP ${badOffer.status}`);

  const offerRes = await call(`/api/admin/custom-requests/${requestId}/offers`, { method: "POST", body: JSON.stringify({
    name: "Custom Growth 5", description: "Five websites, 40k credits", price: 120, credits: 40000, websiteLimit: 5, includedFeatures: "Priority support", expiresInDays: 7,
  }) }, adminCookie);
  check("admin sends offer", offerRes.status === 201, `HTTP ${offerRes.status}`);
  const offerId = offerRes.body.offer?.id;

  const adminView = await call(`/api/admin/custom-requests/${requestId}`, {}, adminCookie);
  check("offer visible to admin", adminView.body.offers?.[0]?.status === "sent");

  const customerView = await call("/api/custom-requests");
  const mine = customerView.body.requests?.find((r) => r.id === requestId);
  check("offer visible to customer", mine?.offers?.[0]?.status === "sent" && mine.status === "offer_sent");

  const revision = await call(`/api/custom-requests/${requestId}/offers/${offerId}/respond`, { method: "POST", body: JSON.stringify({ action: "revision", note: "Can you include 45k credits?" }) });
  check("revision request accepted", revision.status === 200, `HTTP ${revision.status}`);

  const resend = await call(`/api/admin/custom-requests/${requestId}/offers/${offerId}`, { method: "PATCH", body: JSON.stringify({ action: "send" }) }, adminCookie);
  check("offer resent", resend.status === 200, `HTTP ${resend.status}`);

  const accept = await call(`/api/custom-requests/${requestId}/offers/${offerId}/respond`, { method: "POST", body: JSON.stringify({ action: "accept" }) });
  check("customer accepts offer → pending invoice", accept.status === 200 && accept.body.payment?.reference, JSON.stringify(accept.body.payment || accept.body));
  const paymentId = accept.body.payment?.id;

  const double = await call(`/api/custom-requests/${requestId}/offers/${offerId}/respond`, { method: "POST", body: JSON.stringify({ action: "accept" }) });
  check("second accept refused", double.status === 400, `HTTP ${double.status}`);

  const notApproved = await call("/api/custom-requests");
  check("awaiting payment before verification", notApproved.body.requests.find((r) => r.id === requestId)?.status === "awaiting_customer");

  const verify = await call(`/api/admin/payments/${paymentId}/verify`, { method: "POST", body: JSON.stringify({}) }, adminCookie);
  check("admin verifies custom payment", verify.status === 200, `HTTP ${verify.status} ${JSON.stringify(verify.body).slice(0, 120)}`);

  const after = await call("/api/custom-requests");
  const done = after.body.requests.find((r) => r.id === requestId);
  check("request approved after verification", done?.status === "approved", `status=${done?.status}`);
  check("offer marked paid", done?.offers?.[0]?.status === "paid", `status=${done?.offers?.[0]?.status}`);

  const payments = await call("/api/admin/payments", {}, adminCookie);
  const payRow = payments.body.payments?.find((row) => row.id === paymentId);
  check("payment row marked paid", payRow?.status === "paid", payRow?.status);

  const refund = await call(`/api/admin/payments/${paymentId}/refund`, { method: "POST", body: JSON.stringify({ reason: "Test refund" }) }, adminCookie);
  check("refund recorded", refund.status === 200, `HTTP ${refund.status}`);
  const twice = await call(`/api/admin/payments/${paymentId}/refund`, { method: "POST", body: JSON.stringify({ reason: "again" }) }, adminCookie);
  check("duplicate refund refused", twice.status === 400 || twice.status === 409, `HTTP ${twice.status}`);
  const afterRefund = await call("/api/admin/payments", {}, adminCookie);
  const refundRow = afterRefund.body.payments?.find((row) => row.id === paymentId);
  check("payment marked refunded", refundRow?.status === "refunded", refundRow?.status);
} catch (error) {
  console.log("FAIL harness —", error.message);
  process.exitCode = 1;
} finally {
  if (child) child.kill();
}
await waitForPortFree();
setTimeout(() => process.exit(process.exitCode || 0), 300);
