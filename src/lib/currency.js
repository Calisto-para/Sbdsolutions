export const CURRENCY_KEY = "sbd-currency";
export const CURRENCIES = ["NGN", "USD"];

/* Nigerian visitors default to Naira; everyone else defaults to US Dollars.
   The choice is only a display preference — the catalogue holds exact fixed
   amounts for each currency, nothing is converted. */
export function defaultCurrency() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const locale = navigator.language || "";
    if (/^Africa\/Lagos$/i.test(zone) || /-NG$/i.test(locale)) return "NGN";
  } catch {
    /* fall through to USD */
  }
  return "USD";
}

export function readCurrency() {
  try {
    const stored = localStorage.getItem(CURRENCY_KEY);
    if (CURRENCIES.includes(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return defaultCurrency();
}

export function rememberCurrency(currency) {
  try {
    localStorage.setItem(CURRENCY_KEY, currency);
  } catch {
    /* storage unavailable — the selection still works for this page */
  }
}

export function formatPrice(amount, currency) {
  const value = Number(amount || 0);
  return currency === "NGN"
    ? `₦${value.toLocaleString("en-NG")}`
    : `$${value.toLocaleString("en-US")}`;
}

export function currencyLabel(currency) {
  return currency === "NGN" ? "Nigerian Naira (NGN)" : "US Dollars (USD)";
}
