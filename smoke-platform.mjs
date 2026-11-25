/* End-to-end check of the platform API against a running server.
   Usage: node scripts/smoke-platform.mjs [baseUrl] */
import http from "node:http";

const BASE = process.argv[2] || "http://127.0.0.1:3002";
let cookie = "";
let failures = 0;

const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const prompt = JSON.parse(body || "{}").messages?.at(-1)?.content || "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: `MOCK REPLY to: ${prompt.slice(0, 60)}` } }],
        usage: { total_tokens: 12 },
      })
    );
  });
});
await new Promise((resolve) => mock.listen(4010, "127.0.0.1", resolve));

async function call(path, { method = "GET", body, formData } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      cookie,
    },
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const email = `owner${Date.now()}@example.com`;
const password = "Password123";

console.log("health");
const health = await call("/api/health");
check("health 200", health.status === 200, JSON.stringify(health.data));

console.log("registration");
const register = await call("/api/auth/register", {
  method: "POST",
  body: {
    fullName: "Test Owner",
    businessName: "Test Business",
    email,
    phone: "+2348000000000",
    country: "Nigeria",
    password,
    confirmPassword: password,
  },
});
check("register 201", register.status === 201, JSON.stringify(register.data));
check("verification link returned", Boolean(register.data.previewUrl));
const token = new URL(register.data.previewUrl || "http://x/?token=").searchParams.get("token");

const blockedLogin = await call("/api/auth/login", { method: "POST", body: { email, password } });
check("login blocked before verification", blockedLogin.status === 403 && blockedLogin.data.code === "EMAIL_UNVERIFIED", JSON.stringify(blockedLogin.data));

console.log("email verification");
const verify = await call("/api/auth/verify-email", { method: "POST", body: { token } });
check("verify 200", verify.status === 200, JSON.stringify(verify.data));
check("session set by verification", Boolean(cookie));

console.log("login / logout");
await call("/api/auth/logout", { method: "POST" });
check("logout clears session", (await call("/api/auth/me")).status === 401);
const login = await call("/api/auth/login", { method: "POST", body: { email, password } });
check("login 200", login.status === 200, JSON.stringify(login.data));
check("me after login", (await call("/api/auth/me")).data.user?.email === email);

console.log("business profile");
const business = await call("/api/business", {
  method: "PUT",
  body: { name: "Test Business", industry: "Retail", website: "https://example.com", description: "We sell widgets.", supportEmail: "help@example.com", phone: "+2348000000000", address: "Lagos" },
});
check("business saved", business.status === 200 && business.data.business.name === "Test Business", JSON.stringify(business.data));

console.log("assistants");
const created = await call("/api/assistants", {
  method: "POST",
  body: {
    name: "Test Assistant",
    businessDescription: "We sell widgets and gadgets.",
    services: "Widget delivery, gadget repair",
    products: "Widget Pro, Gadget Mini",
    tone: "professional",
    language: "English",
    greeting: "Hello!",
    instructions: "Never invent prices.",
  },
});
check("assistant created", created.status === 201, JSON.stringify(created.data));
const assistantId = created.data.assistant?.id;

const list = await call("/api/assistants");
check("assistant listed", list.data.assistants?.length === 1);

console.log("training");
const note = await call(`/api/assistants/${assistantId}/knowledge`, {
  method: "POST",
  body: { kind: "note", title: "Opening hours", content: "We open 9am to 5pm, Monday to Saturday." },
});
check("training note saved", note.status === 201, JSON.stringify(note.data));
const faq = await call(`/api/assistants/${assistantId}/knowledge`, {
  method: "POST",
  body: { kind: "faq", title: "Do you deliver?", content: "Yes, within Lagos in 48 hours." },
});
check("FAQ saved", faq.status === 201);
const pricing = await call(`/api/assistants/${assistantId}/knowledge`, {
  method: "POST",
  body: { kind: "pricing", title: "Widget Pro", content: "Widget Pro costs 25,000 naira." },
});
check("pricing saved", pricing.status === 201);
const itemId = note.data.item.id;
const edited = await call(`/api/assistants/${assistantId}/knowledge/${itemId}`, {
  method: "PATCH",
  body: { content: "We open 8am to 6pm, Monday to Saturday." },
});
check("training edited", edited.status === 200 && edited.data.item.content.includes("8am"));
const knowledge = await call(`/api/assistants/${assistantId}/knowledge`);
check("training listed", knowledge.data.items?.length === 3);

console.log("chat / testing");
const chat = await call(`/api/assistants/${assistantId}/chat`, {
  method: "POST",
  body: { message: "How much is Widget Pro?" },
});
check("chat replied", chat.status === 200 && chat.data.reply?.includes("MOCK REPLY"), JSON.stringify(chat.data));
check("conversation created", Boolean(chat.data.conversationId));

const followUp = await call(`/api/assistants/${assistantId}/chat`, {
  method: "POST",
  body: { message: "And when are you open?", conversationId: chat.data.conversationId },
});
check("follow-up replied in same conversation", followUp.status === 200 && followUp.data.conversationId === chat.data.conversationId);

const transcript = await call(`/api/conversations/${chat.data.conversationId}`);
check("transcript has 4 messages", transcript.data.messages?.length === 4, String(transcript.data.messages?.length));

const convList = await call("/api/conversations");
check("conversation listed", convList.data.conversations?.length === 1);

console.log("assistant settings");
const patched = await call(`/api/assistants/${assistantId}`, {
  method: "PATCH",
  body: { instructions: "Always offer a quote after pricing questions." },
});
check("assistant patched", patched.status === 200 && patched.data.assistant.instructions.includes("quote"));

const overview = await call("/api/overview");
check("overview stats", overview.data.stats?.assistants === 1 && overview.data.stats?.conversations === 1, JSON.stringify(overview.data.stats));

console.log("password reset");
const forgot = await call("/api/auth/forgot-password", { method: "POST", body: { email } });
check("forgot returns link", forgot.status === 200 && Boolean(forgot.data.previewUrl), JSON.stringify(forgot.data));
const resetToken = new URL(forgot.data.previewUrl || "http://x/?token=").searchParams.get("token");
const reset = await call("/api/auth/reset-password", {
  method: "POST",
  body: { token: resetToken, password: "NewPassword456", confirmPassword: "NewPassword456" },
});
check("reset 200", reset.status === 200, JSON.stringify(reset.data));
await call("/api/auth/logout", { method: "POST" });
const oldPassword = await call("/api/auth/login", { method: "POST", body: { email, password } });
check("old password rejected", oldPassword.status === 401);
const newPassword = await call("/api/auth/login", { method: "POST", body: { email, password: "NewPassword456" } });
check("new password works", newPassword.status === 200);

console.log("authorisation");
const other = await call(`/api/conversations/00000000-0000-0000-0000-000000000000`);
check("unknown conversation 404", other.status === 404);

console.log("static pages");
for (const page of ["/dashboard", "/register", "/login", "/services", "/services.html", "/dashboard.html"]) {
  const response = await fetch(`${BASE}${page}`);
  check(`${page} 200 html`, response.status === 200 && (await response.text()).includes("SBD AI Solutions"));
}

mock.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
