import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { one } from "../server/db.js";

const base = "http://127.0.0.1:3113";
const stamp = Date.now();
const adminEmail = `nt-admin-${stamp}@example.com`;
const customerEmail = `nt-customer-${stamp}@example.com`;
const password = "Str0ngPass!23";
const hash = await bcrypt.hash(password, 10);
for (const [email, name, role] of [[adminEmail, "NT Admin", "admin"], [customerEmail, "NT Customer", "client"]]) {
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
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: res.status, body, contentType: res.headers.get("content-type") || "" };
  };
}

try {
  child = spawn("node", ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: "3113" }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + "/api/health"); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  const admin = session();
  const customer = session();
  await admin("/api/auth/login", { method: "POST", body: JSON.stringify({ email: adminEmail, password }) });
  await customer("/api/auth/login", { method: "POST", body: JSON.stringify({ email: customerEmail, password }) });

  const config = await customer("/api/notifications/push/config");
  check("push public config never exposes a private key", !JSON.stringify(config.body).match(/private_key|privateKey|client_email|clientEmail/), Object.keys(config.body).join(","));

  const ticket = await customer("/api/support", { method: "POST", body: JSON.stringify({ subject: "Push test ticket", message: "Please reply to this ticket." }) });
  check("customer opens ticket", ticket.status === 201, `HTTP ${ticket.status}`);
  const ticketId = ticket.body.ticket?.id;

  const reply = await admin(`/api/admin/support/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ message: "We have replied to your ticket." }) });
  check("staff reply stored", reply.status === 201, `HTTP ${reply.status}`);

  const centre = await customer("/api/notifications");
  const note = centre.body.notifications?.find((row) => row.kind === "support_reply");
  check("in-app notification created", Boolean(note), note ? note.title : "missing");
  check("notification delivery statuses recorded", typeof note?.emailStatus === "string" && typeof note?.pushStatus === "string", `${note?.emailStatus}/${note?.pushStatus}`);
  check("in-app works without Firebase/email", note?.read === false);

  const noDevices = await customer("/api/notifications/push/test", { method: "POST", body: "{}" });
  check("push test refuses honestly when unconfigured", noDevices.status === 400 || noDevices.status === 503, `HTTP ${noDevices.status} ${noDevices.body?.code || ""}`);

  await customer("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify({ push: false }) });
  const reply2 = await admin(`/api/admin/support/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ message: "Second reply after push was disabled." }) });
  check("second reply stored", reply2.status === 201, `HTTP ${reply2.status}`);
  const centre2 = await customer("/api/notifications");
  const latest = centre2.body.notifications?.find((row) => row.kind === "support_reply");
  check("push skipped while disabled", latest?.pushStatus === "skipped", latest?.pushStatus);
  check("in-app still delivered while push disabled", Boolean(latest?.id));

  const badDevice = await customer("/api/notifications/push/devices", { method: "POST", body: JSON.stringify({ token: "", label: "phone" }) });
  check("empty device token refused", badDevice.status === 400, `HTTP ${badDevice.status}`);

  const receipt = await customer(`/api/subscriptions/payments/00000000-0000-0000-0000-000000000000/receipt`);
  check("unknown receipt is not leaked", receipt.status === 404, `HTTP ${receipt.status}`);
} catch (error) {
  console.log("FAIL harness —", error.message);
  failures += 1;
} finally {
  if (child) child.kill();
}
console.log(failures === 0 ? "ALL NOTIFICATION CHECKS PASSED" : `${failures} FAILURE(S)`);
setTimeout(() => process.exit(failures === 0 ? 0 : 1), 300);
