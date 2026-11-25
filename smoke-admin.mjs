/* End-to-end check of the unlisted operator area.
   Usage: ADMIN_EMAILS=admin-check@example.com node scripts/smoke-admin.mjs [baseUrl] */
const BASE = process.argv[2] || "http://127.0.0.1:3003";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin-check@example.com";
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

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
  return { status: response.status, data, cookie: nextCookie, headers: response.headers };
}

async function makeAccount(email, name) {
  const registered = await call("/api/auth/register", {
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
  const token = new URL(registered.data.previewUrl || "http://x/?token=").searchParams.get("token");
  const verified = await call("/api/auth/verify-email", { method: "POST", body: { token } });
  return { register: registered, verify: verified, cookie: verified.cookie };
}

const clientEmail = `client${Date.now()}@example.com`;

console.log("operator sign-in");
const admin = await makeAccount(ADMIN_EMAIL, "Ops Admin");
check("admin registers", admin.register.status === 201, JSON.stringify(admin.register.data));
check("admin verifies", admin.verify.status === 200, JSON.stringify(admin.verify.data));
check("allowlisted account is an operator", admin.verify.data.user?.role === "admin", JSON.stringify(admin.verify.data.user));

const adminLogin = await call("/api/auth/login", {
  method: "POST",
  body: { email: ADMIN_EMAIL, password: "Password123" },
});
check("admin login", adminLogin.status === 200, JSON.stringify(adminLogin.data));
check("login returns admin role", adminLogin.data.user?.role === "admin", JSON.stringify(adminLogin.data.user));
const adminCookie = adminLogin.cookie;

console.log("operator endpoints");
const overview = await call("/api/admin", { cookie: adminCookie });
check("overview 200", overview.status === 200, JSON.stringify(overview.data));
check("overview stats", typeof overview.data.stats?.users === "number", JSON.stringify(overview.data.stats));

const list = await call("/api/admin/users", { cookie: adminCookie });
check("users list", list.status === 200 && Array.isArray(list.data.users), JSON.stringify(list.data));
check("users include admin", Boolean(list.data.users?.some((u) => u.email === ADMIN_EMAIL)));

const searched = await call(`/api/admin/users?q=${encodeURIComponent(ADMIN_EMAIL)}`, { cookie: adminCookie });
check("user search", searched.data.users?.length === 1, JSON.stringify(searched.data.users));

console.log("client isolation");
const client = await makeAccount(clientEmail, "Plain Client");
check("client verifies", client.verify.status === 200, JSON.stringify(client.verify.data));
check("client role", client.verify.data.user?.role === "client", JSON.stringify(client.verify.data.user));

const clientAdminCall = await call("/api/admin", { cookie: client.cookie });
check("client gets 404 on admin api", clientAdminCall.status === 404, String(clientAdminCall.status));
const clientUsers = await call("/api/admin/users", { cookie: client.cookie });
check("client gets 404 on users api", clientUsers.status === 404, String(clientUsers.status));
const anon = await call("/api/admin");
check("anonymous gets 404", anon.status === 404, String(anon.status));

console.log("role management");
const all = (await call("/api/admin/users", { cookie: adminCookie })).data.users;
const clientRow = all.find((u) => u.email === clientEmail);
const detailBefore = await call(`/api/admin/users/${clientRow.id}`, { cookie: adminCookie });
check("user detail", detailBefore.status === 200 && detailBefore.data.user.email === clientEmail, JSON.stringify(detailBefore.data));

const promote = await call(`/api/admin/users/${clientRow.id}`, {
  method: "PATCH",
  cookie: adminCookie,
  body: { role: "admin" },
});
check("promote client", promote.status === 200 && promote.data.user.role === "admin", JSON.stringify(promote.data));

const adminRow = all.find((u) => u.email === ADMIN_EMAIL);
const selfDemote = await call(`/api/admin/users/${adminRow.id}`, {
  method: "PATCH",
  cookie: adminCookie,
  body: { role: "client" },
});
check("cannot demote self", selfDemote.status === 400, JSON.stringify(selfDemote.data));

const demote = await call(`/api/admin/users/${clientRow.id}`, {
  method: "PATCH",
  cookie: adminCookie,
  body: { role: "client" },
});
check("demote again", demote.status === 200 && demote.data.user.role === "client", JSON.stringify(demote.data));

console.log("conversations + stealth");
const conversations = await call("/api/admin/conversations", { cookie: adminCookie });
check(
  "conversations 200",
  conversations.status === 200 && Array.isArray(conversations.data.conversations),
  JSON.stringify(conversations.data).slice(0, 200)
);

const adminPage = await fetch(`${BASE}/admin`);
const html = await adminPage.text();
check("/admin serves the app", adminPage.status === 200 && html.includes('id="root"'), String(adminPage.status));
check("/admin is noindex", (adminPage.headers.get("x-robots-tag") || "").includes("noindex"), adminPage.headers.get("x-robots-tag") || "none");
check("public shell has no admin link", !html.includes('href="/admin"'), "found a link");

console.log(failures === 0 ? "\nALL ADMIN CHECKS PASSED" : `\n${failures} ADMIN CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
