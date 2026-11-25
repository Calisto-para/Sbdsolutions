/* End-to-end checks for the chatbot, leads, conversation management, admin
   controls and subscriptions. Runs against the local API with a stubbed AI:
     OPENAI_API_KEY=stub OPENAI_BASE_URL=http://127.0.0.1:4035/v1
   Usage: node scripts/smoke-features.mjs [baseUrl] */
import http from "node:http";

const BASE = process.argv[2] || "http://127.0.0.1:3021";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ops-features@example.com";
const stamp = Date.now();
let failures = 0;

const check = (label, condition, detail = "") => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
};

const ai = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "stub",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "stub",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "Thanks! I can help with that." },
          },
        ],
      })
    );
  });
});
await new Promise((resolve) => ai.listen(4035, "127.0.0.1", resolve));

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
  return { status: response.status, data, cookie: nextCookie, headers: response.headers, text };
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

async function registerAndLogin(email, name) {
  const registration = await call("/api/auth/register", { method: "POST", body: account(email, name) });
  if (registration.data.previewUrl) {
    const token = new URL(registration.data.previewUrl).searchParams.get("token");
    await call("/api/auth/verify-email", { method: "POST", body: { token } });
  }
  return call("/api/auth/login", { method: "POST", body: { email, password: "Password123" } });
}

console.log("customer account");
const clientEmail = `client${stamp}@example.com`;
const login = await registerAndLogin(clientEmail, "Feature Client");
const cookie = login.cookie;
check("client signs in", login.status === 200, JSON.stringify(login.data));

console.log("chatbot configuration");
const created = await call("/api/assistants", {
  method: "POST",
  cookie,
  body: { name: "Front Desk", greeting: "Hi! How can we help?" },
});
check("assistant created", created.status === 201, JSON.stringify(created.data));
const assistant = created.data.assistant;
check("assistant has a public widget key", /^[a-f0-9]{16,64}$/.test(assistant.publicKey || ""), assistant.publicKey);

const limit = await call("/api/assistants", { method: "POST", cookie, body: { name: "Second Assistant" } });
check("starter plan blocks a second assistant", limit.status === 403 && limit.data.code === "PLAN_LIMIT", JSON.stringify(limit.data));

const customised = await call(`/api/assistants/${assistant.id}`, {
  method: "PATCH",
  cookie,
  body: { name: "Ada from SBD", widgetColor: "#12a150", welcomeMessage: "Hello! Ask me anything.", widgetPosition: "left" },
});
check(
  "name, colour and welcome message saved",
  customised.data.assistant?.widgetColor === "#12a150" &&
    customised.data.assistant?.welcomeMessage === "Hello! Ask me anything." &&
    customised.data.assistant?.name === "Ada from SBD",
  JSON.stringify(customised.data.assistant)
);

const badColour = await call(`/api/assistants/${assistant.id}`, { method: "PATCH", cookie, body: { widgetColor: "blue" } });
check("invalid colour rejected", badColour.status === 400, JSON.stringify(badColour.data));

const script = await call("/widget.js");
check("installation script is served", script.status === 200 && /sbdw-bubble/.test(script.text), String(script.status));
check("installation script is JavaScript", /javascript/.test(script.headers.get("content-type") || ""), script.headers.get("content-type"));

const config = await call(`/api/widget/${assistant.publicKey}`);
check("widget reads the published settings", config.data.assistant?.name === "Ada from SBD", JSON.stringify(config.data));
check("widget welcome message reaches visitors", config.data.assistant?.welcomeMessage === "Hello! Ask me anything.");
check("widget colour reaches visitors", config.data.assistant?.color === "#12a150");

console.log("visitor chat and lead capture");
const chat = await call(`/api/widget/${assistant.publicKey}/chat`, {
  method: "POST",
  body: { message: "Hi, my name is Musa and I need a new website. Email musa@example.com, phone 0803 123 4567" },
});
check("visitor gets a reply", chat.status === 200 && !!chat.data.reply, JSON.stringify(chat.data));
check("lead captured from the conversation", chat.data.leadCaptured === true, JSON.stringify(chat.data));
const visitorConversation = chat.data.conversationId;

const second = await call(`/api/widget/${assistant.publicKey}/chat`, {
  method: "POST",
  body: { message: "What do you charge?", conversationId: visitorConversation },
});
check("conversation continues", second.data.conversationId === visitorConversation, JSON.stringify(second.data));

const leads = await call("/api/leads", { cookie });
check("lead appears in the dashboard", leads.data.leads?.length === 1, JSON.stringify(leads.data));
check("lead has name, email, phone and service", leads.data.leads?.[0]?.name === "Musa" &&
  leads.data.leads?.[0]?.email === "musa@example.com" &&
  /0803/.test(leads.data.leads?.[0]?.phone || "") &&
  /website/i.test(leads.data.leads?.[0]?.service || ""), JSON.stringify(leads.data.leads?.[0]));

const formLead = await call(`/api/widget/${assistant.publicKey}/lead`, {
  method: "POST",
  body: { conversationId: visitorConversation, name: "Musa Bello", email: "musa.bello@example.com", service: "Brand design" },
});
check("details form saved", formLead.status === 201, JSON.stringify(formLead.data));
const enriched = await call("/api/leads", { cookie });
check("lead is enriched, not duplicated", enriched.data.leads?.length === 1 &&
  enriched.data.leads[0].email === "musa.bello@example.com", JSON.stringify(enriched.data.leads));

console.log("conversation management");
const list = await call("/api/conversations?q=musa&status=open", { cookie });
check("search finds the website conversation", list.data.conversations?.length === 1, JSON.stringify(list.data));
check("conversation shows its channel", list.data.conversations?.[0]?.channel === "widget");

const detail = await call(`/api/conversations/${visitorConversation}`, { cookie });
check("full transcript returned", detail.data.messages?.length === 4, JSON.stringify(detail.data.messages?.length));
check("transcript carries the lead", detail.data.lead?.email === "musa.bello@example.com");

const takeover = await call(`/api/conversations/${visitorConversation}`, {
  method: "PATCH",
  cookie,
  body: { takeover: true },
});
check("operator takes over", takeover.data.conversation?.takeover === true, JSON.stringify(takeover.data));

const reply = await call(`/api/conversations/${visitorConversation}/messages`, {
  method: "POST",
  cookie,
  body: { message: "Hi Musa, this is the team. We can start tomorrow." },
});
check("team reply saved", reply.status === 201 && reply.data.message?.author === "team", JSON.stringify(reply.data));

const widgetPoll = await call(`/api/widget/${assistant.publicKey}/conversation/${visitorConversation}`);
check("visitor sees the team reply", widgetPoll.data.messages?.some((m) => m.author === "team"), JSON.stringify(widgetPoll.data.messages?.slice(-1)));
check("visitor sees takeover state", widgetPoll.data.takeover === true);

const pausedAi = await call(`/api/widget/${assistant.publicKey}/chat`, {
  method: "POST",
  body: { message: "Can I book now?", conversationId: visitorConversation },
});
check("assistant stops answering after takeover", pausedAi.data.reply === "" && pausedAi.data.takeover === true, JSON.stringify(pausedAi.data));

const resolved = await call(`/api/conversations/${visitorConversation}`, {
  method: "PATCH",
  cookie,
  body: { status: "resolved" },
});
check("conversation marked resolved", resolved.data.conversation?.status === "resolved");
const resolvedFilter = await call("/api/conversations?status=resolved", { cookie });
check("resolved filter works", resolvedFilter.data.conversations?.length === 1);

console.log("subscriptions");
const subscription = await call("/api/subscriptions", { cookie });
check("plan listed", subscription.data.plan?.id === "starter" && subscription.data.plans?.length === 3, JSON.stringify(subscription.data.plan));
check("usage counted", subscription.data.usage?.messages >= 3 && subscription.data.usage?.assistants === 1, JSON.stringify(subscription.data.usage));

const upgraded = await call("/api/subscriptions", { method: "POST", cookie, body: { planId: "growth" } });
check("plan upgraded", upgraded.data.planId === "growth", JSON.stringify(upgraded.data));
check("upgrade recorded in payment history", upgraded.data.payments?.[0]?.planId === "growth" && upgraded.data.payments[0].status === "pending", JSON.stringify(upgraded.data.payments?.[0]));

const secondAssistant = await call("/api/assistants", { method: "POST", cookie, body: { name: "Support Bot" } });
check("higher plan allows another assistant", secondAssistant.status === 201, JSON.stringify(secondAssistant.data));

const customPlan = await call("/api/subscriptions", { method: "POST", cookie, body: { planId: "not-a-plan" } });
check("unknown plan rejected", customPlan.status === 404, JSON.stringify(customPlan.data));

const cancelled = await call("/api/subscriptions/cancel", { method: "POST", cookie });
check("subscription cancels", cancelled.data.cancelAtPeriodEnd === true && cancelled.data.status === "canceled", JSON.stringify(cancelled.data));

console.log("operator controls");
const operatorLogin = await registerAndLogin(ADMIN_EMAIL, "Operator");
const operator = operatorLogin.cookie;
check("operator signs in", operatorLogin.data.user?.role === "admin", JSON.stringify(operatorLogin.data.user));

const customers = await call("/api/admin/users", { cookie: operator });
const customer = customers.data.users?.find((user) => user.email === clientEmail);
check("customer listed for the operator", Boolean(customer), JSON.stringify(customers.data.users?.map((u) => u.email)));

const suspended = await call(`/api/admin/users/${customer.id}`, {
  method: "PATCH",
  cookie: operator,
  body: { suspended: true, suspendedReason: "Smoke test" },
});
check("account suspended", suspended.data.user?.suspended === true, JSON.stringify(suspended.data));

const blockedSignIn = await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "Password123" } });
check("suspended account cannot sign in", blockedSignIn.status === 403 && blockedSignIn.data.code === "ACCOUNT_SUSPENDED", JSON.stringify(blockedSignIn.data));

const blockedApi = await call("/api/assistants", { cookie });
check("existing session is refused", blockedApi.status === 403 && blockedApi.data.code === "ACCOUNT_SUSPENDED", JSON.stringify(blockedApi.data));

const reactivated = await call(`/api/admin/users/${customer.id}`, {
  method: "PATCH",
  cookie: operator,
  body: { suspended: false },
});
check("account reactivated", reactivated.data.user?.suspended === false, JSON.stringify(reactivated.data));

const afterLogin = await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "Password123" } });
check("reactivated account signs in again", afterLogin.status === 200, JSON.stringify(afterLogin.data));
const afterApi = await call("/api/assistants", { cookie: afterLogin.cookie });
check("reactivated account can use the API", afterApi.status === 200, JSON.stringify(afterApi.data).slice(0, 120));

const selfSuspend = await call(`/api/admin/users/${operatorLogin.data.user.id}`, {
  method: "PATCH",
  cookie: operator,
  body: { suspended: true },
});
check("operator cannot suspend themselves", selfSuspend.status === 400, JSON.stringify(selfSuspend.data));

const platform = await call("/api/admin/platform", { cookie: operator });
check("platform activity reported", platform.data.activity?.messagesThisWeek >= 4, JSON.stringify(platform.data.activity));
check("daily activity has 7 days", platform.data.daily?.length === 7);

const businesses = await call("/api/admin/businesses", { cookie: operator });
check("businesses listed", businesses.data.businesses?.some((b) => b.email === clientEmail), JSON.stringify(businesses.data.businesses?.map((b) => b.email)));

const allAssistants = await call("/api/admin/assistants", { cookie: operator });
check("all assistants listed", allAssistants.data.assistants?.length === 2, JSON.stringify(allAssistants.data.assistants?.length));

ai.close();
console.log(failures === 0 ? "\nALL FEATURE CHECKS PASSED" : `\n${failures} FEATURE CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
