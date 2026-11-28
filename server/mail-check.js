import { env } from "./env.js";
import { emailProviders } from "./mail.js";

const TIMEOUT_MS = 12000;
const FREE_MAILBOX = /@(gmail|googlemail|yahoo|yahoo\.co|hotmail|outlook|live|icloud|aol|proton|protonmail|gmx|mail)\./i;

const isFreeMailbox = () => FREE_MAILBOX.test(senderAddress());

export function senderAddress() {
  const raw = String(env.mail.from || "").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

/* A sender on a free mailbox domain can never be verified at Resend, so every
   message is rejected. Surfaced at boot and in the operator dashboard. */
export function senderWarning() {
  if (!isFreeMailbox()) return "";
  return `MAIL_FROM uses ${senderAddress()}, and Resend cannot verify a free mailbox domain. Verify a domain you own at resend.com/domains, or set BREVO_API_KEY and verify ${senderAddress()} as a sender in Brevo.`;
}

export function senderDomain() {
  const address = senderAddress();
  return address.includes("@") ? address.split("@").pop().toLowerCase() : "";
}

const base = (url, fallback) => {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
};

async function getJson(url, headers) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${text.slice(0, 240) || response.statusText}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function resendCheck() {
  const data = await getJson(`${base(env.mail.resend.apiUrl, "https://api.resend.com")}/domains`, {
    authorization: `Bearer ${env.mail.resend.apiKey}`,
  });
  const domains = Array.isArray(data) ? data : data.data || [];
  const verified = domains.filter((domain) => domain.status === "verified").map((domain) => domain.name);
  const domain = senderDomain();
  const verifiedSender = verified.includes(domain);
  return {
    provider: "resend",
    ok: verifiedSender,
    verifiedDomains: verified,
    message: verifiedSender
      ? `Resend accepts ${domain}.`
      : domain === "resend.dev"
        ? "Resend only delivers from onboarding@resend.dev to the account owner's own address — add and verify your own domain to email customers."
        : `Resend will reject ${domain}: it is not a verified domain on this account. Verify the domain in Resend, or send through Brevo instead (Brevo can verify a single sender address such as a Gmail inbox).`,
  };
}

async function brevoCheck() {
  const origin = base(env.mail.brevo.apiUrl, "https://api.brevo.com");
  let data;
  try {
    data = await getJson(`${origin}/v3/senders`, { "api-key": env.mail.brevo.apiKey });
  } catch (error) {
    const wrongKey = /401|403/.test(error.message) && !env.mail.brevo.apiKey.startsWith("xkeysib-");
    return {
      provider: "brevo",
      ok: false,
      verifiedDomains: [],
      message: wrongKey
        ? "Brevo rejected the key. The transactional API needs a v3 API key (starts with xkeysib-), not an SMTP key (xsmtpsib-). Get one from app.brevo.com → SMTP & API → API Keys."
        : `Brevo could not be checked: ${error.message}`,
    };
  }
  const senders = Array.isArray(data) ? data : data.senders || [];
  const address = senderAddress().toLowerCase();
  const match = senders.find((sender) => String(sender.email || "").toLowerCase() === address);
  return {
    provider: "brevo",
    ok: Boolean(match?.active),
    verifiedDomains: senders.filter((sender) => sender.active).map((sender) => sender.email),
    message: match?.active
      ? `Brevo has ${match.email} verified as a sender.`
      : `Brevo has not verified ${address}. Verified senders: ${senders.filter((s) => s.active).map((s) => s.email).join(", ") || "none"}.`,
  };
}

async function smtpCheck() {
  return {
    provider: "smtp",
    ok: Boolean(env.mail.smtp.host),
    message: env.mail.smtp.host
      ? `SMTP is configured through ${env.mail.smtp.host}.`
      : "SMTP is not configured.",
  };
}

/* Background, read-only snapshot of the sending account, safe to publish on the
   health check: booleans and a short reason, never keys, addresses or bodies.
   It is never awaited by the health route, so Render's probe stays fast. */
let snapshot = null;
let inFlight = null;

const normalise = (message) => {
  const text = String(message || "");
  if (/Key not found|Unauthorized|401|403/i.test(text)) return "key_rejected";
  if (/sender|from address|not valid/i.test(text)) return "sender_not_verified";
  if (/recipient|to address|invalid email/i.test(text)) return "recipient_rejected";
  if (/quota|limit/i.test(text)) return "quota_reached";
  return "provider_error";
};

async function computeSnapshot() {
  const provider = emailProviders()[0] || "none";
  /* Homepage-visible, so it carries booleans and a reason only — the verified
     addresses themselves stay in the operator dashboard. */
  const value = { provider, keyValid: null, senderVerified: null, verifiedSenderCount: 0, reason: "" };
  try {
    if (provider === "brevo" && env.mail.brevo.apiKey) {
      const origin = base(env.mail.brevo.apiUrl, "https://api.brevo.com");
      try {
        await getJson(`${origin}/v3/account`, { "api-key": env.mail.brevo.apiKey });
        value.keyValid = true;
      } catch (error) {
        /* Only an auth answer is conclusive here; other failures fall through to
           the senders call, which is the check that actually matters. */
        if (normalise(error.message) === "key_rejected") {
          value.keyValid = false;
          value.reason = "key_rejected";
          return value;
        }
      }
      const data = await getJson(`${origin}/v3/senders`, { "api-key": env.mail.brevo.apiKey });
      if (value.keyValid === null) value.keyValid = true;
      const senders = Array.isArray(data) ? data : data.senders || [];
      const active = senders.filter((sender) => sender.active);
      value.verifiedSenderCount = active.length;
      value.senderVerified = active.some(
        (sender) => String(sender.email).toLowerCase() === senderAddress().toLowerCase()
      );
      if (!value.senderVerified) value.reason = "sender_not_verified";
    } else if (provider === "resend" && env.mail.resend.apiKey) {
      try {
        const data = await getJson(`${base(env.mail.resend.apiUrl, "https://api.resend.com")}/domains`, {
          authorization: `Bearer ${env.mail.resend.apiKey}`,
        });
        value.keyValid = true;
        const domains = Array.isArray(data) ? data : data.data || [];
        value.verifiedSenderCount = domains.filter((domain) => domain.status === "verified").length;
        value.senderVerified = domains.some(
          (domain) => domain.status === "verified" && domain.name === senderDomain()
        );
        if (!value.senderVerified) value.reason = "sender_not_verified";
      } catch (error) {
        value.keyValid = false;
        value.reason = normalise(error.message);
      }
    }
  } catch (error) {
    value.reason = "check_failed";
  }
  return value;
}

export function emailHealthSnapshot() {
  /* A failed probe is retried quickly; a good one is cached for five minutes. */
  const ttl = snapshot?.value?.reason === "check_failed" ? 30 * 1000 : 5 * 60 * 1000;
  const stale = !snapshot || Date.now() - snapshot.at > ttl;
  if (stale && !inFlight) {
    inFlight = computeSnapshot()
      .then((value) => {
        snapshot = { at: Date.now(), value };
      })
      .catch(() => {})
      .finally(() => {
        inFlight = null;
      });
  }
  return snapshot ? { ...snapshot.value, checkedAt: new Date(snapshot.at).toISOString() } : null;
}

/* Live check of the sending account: does the provider actually accept this
   sender address? Used by the operator dashboard, never by the public site. */
export async function mailDiagnostics() {
  const providers = emailProviders();
  const domain = senderDomain();
  const result = {
    provider: providers[0] || "none",
    providers,
    from: env.mail.from,
    sender: senderAddress(),
    domain,
    replyTo: env.mail.replyTo || "",
    checks: [],
    ok: false,
    summary: "",
    hint: "",
  };

  if (!providers.length) {
    result.summary = "No email provider is configured.";
    result.hint = "Set RESEND_API_KEY or BREVO_API_KEY in the service environment.";
    return result;
  }

  for (const provider of providers) {
    try {
      if (provider === "resend" && env.mail.resend.apiKey) result.checks.push(await resendCheck());
      if (provider === "brevo" && env.mail.brevo.apiKey) result.checks.push(await brevoCheck());
      if (provider === "smtp") result.checks.push(await smtpCheck());
    } catch (error) {
      result.checks.push({
        provider,
        ok: false,
        verifiedDomains: [],
        message: `${provider} could not be checked: ${error.message}`,
      });
    }
  }

  const working = result.checks.find((check) => check.ok);
  result.ok = Boolean(working);
  result.summary = working
    ? `Sending through ${working.provider}.`
    : result.checks[0]?.message || "The email provider rejected the sender.";

  /* Hints describe a fix, so only show one when nothing is delivering. A working
     primary sender makes an unusable fallback irrelevant noise. */
  /* Name the fix when the provider has a verified address the app is not using. */
  const failing = result.checks.find((check) => !check.ok && check.verifiedDomains?.length);
  if (!result.ok && failing) {
    const suggestion = failing.verifiedDomains[0];
    result.hint = `Set MAIL_FROM to "SBD Solutions <${suggestion}>" in the service environment (or verify ${result.sender} in ${failing.provider}), then restart. Currently it sends from ${result.sender}.`;
  } else if (!result.ok && providers.includes("resend") && isFreeMailbox()) {
    result.hint = "Resend cannot verify a free mailbox domain such as Gmail. Either verify a domain you own at resend.com/domains, or set BREVO_API_KEY and verify this mailbox as a sender in Brevo.";
  }

  return result;
}
