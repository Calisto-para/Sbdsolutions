/* Currencies SBD Solutions can actually charge in, and the countries they
   belong to. This is deliberately conservative: it lists only what the payment
   provider supports, so the checkout can never promise a currency the account
   cannot charge. USD is the base pricing currency for everything.

   Amounts are always the *base* amounts. Local amounts are derived from a live
   exchange rate at checkout and recorded with the payment. */

export const BASE_CURRENCY = "USD";

export const PAYMENT_CURRENCIES = {
  USD: { name: "US Dollar", code: "USD", decimals: 2, minimum: 2, symbol: "$" },
  NGN: { name: "Nigerian Naira", code: "NGN", decimals: 2, minimum: 50, symbol: "₦" },
  GHS: { name: "Ghanaian Cedi", code: "GHS", decimals: 2, minimum: 0.1, symbol: "₵" },
  ZAR: { name: "South African Rand", code: "ZAR", decimals: 2, minimum: 1, symbol: "R" },
  KES: { name: "Kenyan Shilling", code: "KES", decimals: 2, minimum: 3, symbol: "KSh" },
  XOF: { name: "West African CFA franc", code: "XOF", decimals: 0, minimum: 1, symbol: "CFA" },
};

/* Countries offered at checkout. `currency` is the currency that country is
   charged in; places the provider does not support fall back to USD, and the
   checkout explains that clearly instead of pretending to charge locally. */
export const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", local: true },
  { code: "GH", name: "Ghana", currency: "GHS", local: true },
  { code: "ZA", name: "South Africa", currency: "ZAR", local: true },
  { code: "KE", name: "Kenya", currency: "KES", local: true },
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF", local: true },
  { code: "SN", name: "Senegal", currency: "XOF", local: true },
  { code: "BF", name: "Burkina Faso", currency: "XOF", local: true },
  { code: "ML", name: "Mali", currency: "XOF", local: true },
  { code: "BJ", name: "Benin", currency: "XOF", local: true },
  { code: "TG", name: "Togo", currency: "XOF", local: true },
  { code: "US", name: "United States", currency: "USD", local: false },
  { code: "GB", name: "United Kingdom", currency: "USD", local: false },
  { code: "CA", name: "Canada", currency: "USD", local: false },
  { code: "IE", name: "Ireland", currency: "USD", local: false },
  { code: "DE", name: "Germany", currency: "USD", local: false },
  { code: "FR", name: "France", currency: "USD", local: false },
  { code: "NL", name: "Netherlands", currency: "USD", local: false },
  { code: "AE", name: "United Arab Emirates", currency: "USD", local: false },
  { code: "IN", name: "India", currency: "USD", local: false },
  { code: "AU", name: "Australia", currency: "USD", local: false },
  { code: "BR", name: "Brazil", currency: "USD", local: false },
  { code: "XX", name: "Another country", currency: "USD", local: false },
];

export const findCountry = (code) =>
  COUNTRIES.find((country) => country.code === String(code || "").toUpperCase()) || null;

export const currencyForCountry = (code) => findCountry(code)?.currency || BASE_CURRENCY;

export function isPaymentCurrency(code) {
  return Boolean(PAYMENT_CURRENCIES[String(code || "").toUpperCase()]);
}

/* A best-effort country guess from the browser's time zone. It is only a
   default: the customer can always change the country before paying. */
const TIMEZONE_COUNTRY = {
  "Africa/Lagos": "NG",
  "Africa/Accra": "GH",
  "Africa/Johannesburg": "ZA",
  "Africa/Nairobi": "KE",
  "Africa/Abidjan": "CI",
  "Africa/Dakar": "SN",
  "Africa/Ouagadougou": "BF",
  "Africa/Bamako": "ML",
  "Africa/Porto-Novo": "BJ",
  "Africa/Lome": "TG",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Amsterdam": "NL",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "Asia/Dubai": "AE",
  "Asia/Kolkata": "IN",
  "Australia/Sydney": "AU",
  "America/Sao_Paulo": "BR",
};

export function countryFromTimezone(timeZone) {
  return TIMEZONE_COUNTRY[String(timeZone || "")] || "US";
}

export function roundMoney(amount, currency) {
  const decimals = PAYMENT_CURRENCIES[currency]?.decimals ?? 2;
  const factor = 10 ** decimals;
  return Math.round(Number(amount || 0) * factor) / factor;
}

/* The provider takes amounts in the smallest unit of the currency. */
export function toMinorUnits(amount, currency) {
  const decimals = PAYMENT_CURRENCIES[currency]?.decimals ?? 2;
  return Math.round(Number(amount || 0) * 10 ** decimals);
}

export function formatMoney(amount, currency) {
  const meta = PAYMENT_CURRENCIES[currency] || PAYMENT_CURRENCIES.USD;
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(value);
  } catch {
    return `${meta.code} ${value.toFixed(meta.decimals)}`;
  }
}

export const formatUsd = (amount) => `$${Number(amount || 0).toLocaleString("en-US")}`;
