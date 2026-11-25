/* Email delivery checks against a stubbed provider, so a rejected sender and a
   working sender are both exercised without sending real mail.
   Usage: node scripts/smoke-mail.mjs [baseUrl]
   The API must run with RESEND_API_URL pointing at http://127.0.0.1:4031/emails. */
import fs from "node:fs";
import http from "node:http";

const BASE = process.argv[2] || "http://127.0.0.1:3004";
const MODE_FILE = "/tmp/mail-mode";
const mode = () => (fs.existsSync(MODE_FILE) ? fs.readFileSync(MODE_FILE, "utf8").trim() : "reject");
const setMode = (value) => fs.writeFileSync(MODE_FILE, value);

let lastEmail = null;
const stub = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/domains") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: [{ name: "example.com", status: "verified" }] }));
  }
  if (req.method === "POST" && req.url === "/emails") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (mode() === "reject") {
        res.writeHead(403, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            statusCode: 403,
            name: "validation_error",
            message: "The sbdiam.solutions@gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
          })
        );
      }
      lastEmail = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "stub-email-id" }));
    });
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => stub.listen(4031, "127.0.0.1", resolve));

let failures = 0;
const check = (label, condition, detail = "") => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
};

async function call(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  const nextCookie = setCookie.length ? setCookie.map((v) => v.split(";")[0]).join("; ") : cookie;
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }
  return { status: response.status, data, cookie: nextCookie };
}

const account = (email, name) => ({
  fullName: name,
  businessName: `${name} Ltd`,
  email,
  phone: "+2348012345678",
  country: "Nigeria",
  password: "Password123",
  confirmPassword: "Password123",
});

const stamp = Date.now();
const adminEmail = process.env.ADMIN_EMAIL || "ops-mail@example.com";
const blockedEmail = `blocked${stamp}@example.com`;
const workingEmail = `working${stamp}@example.com`;

console.log("working provider");
setMode("accept");
const admin = await call("/api/auth/register", { method: "POST", body: account(adminEmail, "Ops") });
check("registration reports delivery", admin.data.emailDelivered === true, JSON.stringify(admin.data));
const link = String(lastEmail?.html || "").match(/href="([^"]+)"/)?.[1] || "";
check("provider received the verification link", link.includes("/verify-email?token="), link.slice(0, 80));
const token = new URL(link.replace(/&amp;/g, "&")).searchParams.get("token");
const verified = await call("/api/auth/verify-email", { method: "POST", body: { token } });
check("admin verifies", verified.status === 200 && verified.data.user.role === "admin", JSON.stringify(verified.data));
const login = await call("/api/auth/login", { method: "POST", body: { email: adminEmail, password: "Password123" } });
const cookie = login.cookie;

console.log("rejected sender");
setMode("reject");
const blocked = await call("/api/auth/register", { method: "POST", body: account(blockedEmail, "Blocked") });
check("registration still succeeds", blocked.status === 201, JSON.stringify(blocked.data));
check("delivery failure is reported", blocked.data.emailDelivered === false, JSON.stringify(blocked.data));
check("message does not claim the email was sent", !/check your inbox/i.test(blocked.data.message || ""), blocked.data.message);
check("no verification token leaked", !blocked.data.previewUrl, JSON.stringify(blocked.data));
check("failure code returned", blocked.data.code === "EMAIL_NOT_SENT", String(blocked.data.code));

console.log("operator diagnostics");
const status = await call("/api/admin/email", { cookie });
check("diagnostics 200", status.status === 200, JSON.stringify(status.data).slice(0, 200));
check("diagnostics flag the sender", status.data.ok === false, JSON.stringify(status.data).slice(0, 200));
check("hint explains the Resend/Gmail limit", /free mailbox domain/.test(status.data.hint || ""), status.data.hint);
check("provider check lists verified domains", Array.isArray(status.data.checks?.[0]?.verifiedDomains), JSON.stringify(status.data.checks));

const testBad = await call("/api/admin/email-test", { method: "POST", cookie });
check("test send reports rejection", testBad.data.delivered === false, JSON.stringify(testBad.data));
check("provider response is shown", String(testBad.data.failures?.[0] || "").includes("403"), JSON.stringify(testBad.data.failures));

console.log("recovered sender");
setMode("accept");
const testGood = await call("/api/admin/email-test", { method: "POST", cookie });
check("test send succeeds", testGood.data.delivered === true && testGood.data.provider === "resend", JSON.stringify(testGood.data));

const working = await call("/api/auth/register", { method: "POST", body: account(workingEmail, "Working") });
check("new registration delivers", working.data.emailDelivered === true, JSON.stringify(working.data));
check("message tells them to check inbox", /check your inbox/i.test(working.data.message || ""), working.data.message);

stub.close();
console.log(failures === 0 ? "\nALL MAIL CHECKS PASSED" : `\n${failures} MAIL CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
