/* Proves the Brevo path end to end against a stub of Brevo's API.
   Usage: node scripts/smoke-brevo.mjs [baseUrl]
   Start the API with:
     EMAIL_PROVIDER=brevo BREVO_API_KEY=xkeysib-stub
     BREVO_API_URL=http://127.0.0.1:4032/v3/smtp/email
     MAIL_FROM="SBD AI Solutions <support.sbiamautos@gmail.com>" */
import http from "node:http";

const BASE = process.argv[2] || "http://127.0.0.1:3008";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ops-brevo@example.com";
let failures = 0;
let lastPayload = null;
let lastHeaders = {};

const stub = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v3/senders") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        senders: [{ id: 1, email: "support.sbiamautos@gmail.com", active: true }],
      })
    );
  }
  if (req.method === "POST" && req.url === "/v3/smtp/email") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastPayload = JSON.parse(body || "{}");
      lastHeaders = req.headers;
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ messageId: "<stub@brevo>" }));
    });
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => stub.listen(4032, "127.0.0.1", resolve));

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

const register = (email, name) =>
  call("/api/auth/register", {
    method: "POST",
    body: {
      fullName: name,
      businessName: `${name} Ltd`,
      email,
      phone: "+2348012345678",
      country: "Nigeria",
      password: "Password123",
      confirmPassword: "Password123",
    },
  });

const stamp = Date.now();
const admin = await register(ADMIN_EMAIL, "Ops");
check("registration delivered through Brevo", admin.data.emailDelivered === true, JSON.stringify(admin.data));

const link = String(lastPayload?.htmlContent || "").match(/href="([^"]+)"/)?.[1] || "";
check("verification link reached Brevo", link.includes("/verify-email?token="), link.slice(0, 70));
check("Brevo api-key header used", lastHeaders["api-key"] === "xkeysib-stub", String(lastHeaders["api-key"]));
check("sender is the verified address", lastPayload?.sender?.email === "support.sbiamautos@gmail.com", JSON.stringify(lastPayload?.sender));
check("recipient is the client", lastPayload?.to?.[0]?.email === ADMIN_EMAIL, JSON.stringify(lastPayload?.to));
check("subject is set", /verify your sbd ai solutions account/i.test(lastPayload?.subject || ""), String(lastPayload?.subject));

const token = new URL(link.replace(/&amp;/g, "&")).searchParams.get("token");
await call("/api/auth/verify-email", { method: "POST", body: { token } });
const login = await call("/api/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: "Password123" } });
const cookie = login.cookie;

const status = await call("/api/admin/email", { cookie });
check("operator check reports working", status.data.ok === true, JSON.stringify(status.data).slice(0, 200));
check("operator check names Brevo", status.data.provider === "brevo", String(status.data.provider));
check("verified sender is listed", (status.data.checks?.[0]?.verifiedDomains || []).includes("support.sbiamautos@gmail.com"), JSON.stringify(status.data.checks));

const test = await call("/api/admin/email-test", { method: "POST", cookie });
check("test email goes through Brevo", test.data.delivered === true && test.data.provider === "brevo", JSON.stringify(test.data));

const clientEmail = `client${stamp}@example.com`;
const client = await register(clientEmail, "Client");
check("client registration delivered", client.data.emailDelivered === true, JSON.stringify(client.data));
check("client told to check inbox", /check your inbox/i.test(client.data.message || ""), client.data.message);
check("verification email addressed to the client", lastPayload?.to?.[0]?.email === clientEmail, JSON.stringify(lastPayload?.to));
check(
  "client verification link is theirs",
  String(lastPayload?.htmlContent || "").includes("/verify-email?token=")
);

console.log("password reset");
const forgot = await call("/api/auth/forgot-password", { method: "POST", body: { email: clientEmail } });
check("reset request accepted", forgot.status === 200 && forgot.data.emailDelivered === true, JSON.stringify(forgot.data));
check("reset email addressed to the client", lastPayload?.to?.[0]?.email === clientEmail, JSON.stringify(lastPayload?.to));
check("reset subject", /reset your sbd ai solutions password/i.test(lastPayload?.subject || ""), String(lastPayload?.subject));
check(
  "reset link points at the reset page",
  String(lastPayload?.htmlContent || "").includes("/reset-password?token=")
);
check("admin address not used as recipient", lastPayload?.to?.[0]?.email !== ADMIN_EMAIL, JSON.stringify(lastPayload?.to));

stub.close();
console.log(failures === 0 ? "\nALL BREVO CHECKS PASSED" : `\n${failures} BREVO CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
