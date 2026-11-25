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
      : `Brevo has not verified ${address} as a sender. Add it under Senders & IP → Senders in Brevo and confirm the email Brevo sends you.`,
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

  if (providers.includes("resend") && isFreeMailbox()) {
    result.hint = "Resend cannot verify a free mailbox domain such as Gmail. Either verify a domain you own at resend.com/domains, or set BREVO_API_KEY and verify this mailbox as a sender in Brevo.";
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
  return result;
}
