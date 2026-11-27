import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  COUNTRIES,
  countryFromTimezone,
  findCountry,
  formatMoney,
} from "../../../shared/currencies";

const money = (amount, currency) => `${currency} ${Number(amount || 0).toFixed(2)}`;

const detectedCountry = () => {
  try {
    return countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "US";
  }
};

const WHATSAPP =
  "https://wa.me/2349063924288?text=" +
  encodeURIComponent("Hello SBD AI Solutions, I would like to set up the Enterprise plan.");

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function Subscriptions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [checkout, setCheckout] = useState(null);
  const [reference, setReference] = useState("");
  const [country, setCountry] = useState(detectedCountry);

  const load = () =>
    api("/subscriptions")
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const pending = useMemo(
    () => (data?.payments || []).filter((payment) => payment.status === "pending"),
    [data]
  );

  async function verify(paymentId, quiet = false) {
    setBusy(`verify-${paymentId}`);
    if (!quiet) {
      setError("");
      setNotice("");
    }
    try {
      const next = await api(`/subscriptions/payments/${paymentId}/verify`, { method: "POST" });
      await load();
      setNotice(next.message);
      setCheckout(null);
    } catch (err) {
      if (!quiet) setError(err.message);
    } finally {
      setBusy("");
    }
  }

  /* Returning from the payment page: confirm the payment straight away, once,
     and drop the provider's parameters from the address bar. */
  const returnedPayment = useRef("");
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("payment");
    if (!id || returnedPayment.current === id) return;
    returnedPayment.current = id;
    for (const key of ["payment", "status", "tx_ref", "transaction_id"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
    verify(id);
  }, [data?.planId]);

  async function change(planId, nextCountry = country) {
    setBusy(planId);
    setError("");
    setNotice("");
    try {
      const next = await api("/subscriptions", { method: "POST", body: { planId, country: nextCountry } });
      setCheckout(next);
      setReference("");
      setNotice(next.message);
      await load();
      /* Go straight to the provider's checkout — choosing a plan is the intent
         to pay, not just to create a record. */
      if (next.authorizationUrl) {
        window.location.assign(next.authorizationUrl);
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function submitReference(event) {
    event.preventDefault();
    if (!checkout?.payment) return;
    setBusy("submit");
    setError("");
    try {
      const next = await api(`/subscriptions/payments/${checkout.payment.id}/submit`, {
        method: "POST",
        body: { note: reference.trim() },
      });
      setNotice(next.message);
      setReference("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel your subscription? You keep access until the end of the current period.")) return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      const next = await api("/subscriptions/cancel", { method: "POST" });
      setNotice(next.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading your plan…</div>;

  const checkoutInfo = checkout?.checkout;
  const selectedCountry = findCountry(checkoutInfo?.country || country) || findCountry("US");

  const messagePercent = Math.min(
    100,
    Math.round((data.usage.customers / Math.max(1, data.usage.messageLimit)) * 100)
  );
  const assistantPercent = Math.min(
    100,
    Math.round((data.usage.assistants / Math.max(1, data.usage.assistantLimit)) * 100)
  );
  const creditLimit = data.usage.creditLimit;
  const creditsUsed = data.usage.creditsUsed;
  const creditPercent = creditLimit && creditLimit > 0
    ? Math.min(100, Math.round((creditsUsed / creditLimit) * 100))
    : 0;
  const bank = data.paymentConfig?.bank;
  const online = data.paymentConfig?.online;

  return (
    <div className="dash-stack">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      {!data.active ? (
        <div className="form-alert form-alert--error">
          Your plan is not active yet. Choose a plan below, pay the invoice, and it activates as soon as the payment is
          verified.
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Your plan</h2>
            <p>
              {data.plan?.name} ·{" "}
              {data.plan?.custom
                ? data.plan?.billingNote || "Custom billing"
                : `${money(data.plan?.price, data.plan?.currency)} per month`}
              {data.status === "canceled" ? " · cancelled" : ""}
            </p>
          </div>
          <span className={`admin-pill${data.active ? "" : " admin-pill--muted"}`}>
            {data.active ? (data.status === "canceled" ? "Cancelled" : "Active") : "Not active"}
          </span>
        </div>

        <div className="usage-grid">
          <div className="usage-item">
            <div className="usage-head">
              <span>Customers this month</span>
              <strong>{data.usage.customers} / {data.usage.messageLimit}</strong>
            </div>
            <div className="usage-bar"><span style={{ width: `${messagePercent}%` }} /></div>
          </div>
          <div className="usage-item">
            <div className="usage-head">
              <span>AI agents</span>
              <strong>{data.usage.assistants} / {data.usage.assistantLimit}</strong>
            </div>
            <div className="usage-bar"><span style={{ width: `${assistantPercent}%` }} /></div>
          </div>
          <div className="usage-item">
            <div className="usage-head">
              <span>SBD AI credits this month</span>
              <strong>
                {data.usage.creditLimit == null
                  ? "Custom"
                  : `${data.usage.creditsUsed.toLocaleString("en-GB")} / ${data.usage.creditLimit.toLocaleString("en-GB")}`}
              </strong>
            </div>
            <div className="usage-bar">
              <span style={{ width: `${creditPercent}%` }} />
            </div>
          </div>
          <div className="usage-item">
            <div className="usage-head">
              <span>Conversations this month</span>
              <strong>{data.usage.conversations}</strong>
            </div>
            <div className="usage-head">
              <span>Leads collected</span>
              <strong>{data.usage.leads}</strong>
            </div>
          </div>
        </div>

        {data.active ? (
          <p className="panel-note">
            Renews on {dateFormat.format(new Date(data.currentPeriodEnd))}. Plans are billed by the SBD team; every
            payment is recorded below.
          </p>
        ) : null}
      </section>

      {checkout?.payment ? (
        <section className="panel checkout">
          <div className="panel-head">
            <h2>Pay for the {checkout.payment.planId} plan</h2>
            <p>
              Invoice <strong>{checkout.payment.reference}</strong>
            </p>
          </div>

          {checkoutInfo ? (
            <div className="checkout-summary">
              <div className="field">
                <label htmlFor="checkoutCountry">Country you are paying from</label>
                <select
                  id="checkoutCountry"
                  value={selectedCountry?.code || "US"}
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCountry(next);
                    if (checkout?.payment) change(checkout.payment.planId, next);
                  }}
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>

              <dl className="admin-facts checkout-facts">
                <div>
                  <dt>Price</dt>
                  <dd>{formatMoney(checkoutInfo.baseAmountUsd, "USD")} per month</dd>
                </div>
                <div>
                  <dt>Payment currency</dt>
                  <dd>{checkoutInfo.paymentCurrency}</dd>
                </div>
                {checkoutInfo.local ? (
                  <div>
                    <dt>Exchange rate</dt>
                    <dd>
                      1 USD = {Number(checkoutInfo.fxRate).toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
                      {checkoutInfo.paymentCurrency}
                      <span className="panel-note">
                        {checkoutInfo.fxCapturedAt
                          ? `Rate captured ${new Date(checkoutInfo.fxCapturedAt).toLocaleString()}`
                          : "Live rate"}
                        {checkoutInfo.fxStale ? " — the rate service is using its last saved rate" : ""}
                      </span>
                    </dd>
                  </div>
                ) : (
                  <div>
                    <dt>Local currency</dt>
                    <dd>
                      Card payments for {selectedCountry?.name || "your country"} are charged in USD. Your bank may
                      apply its own conversion.
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Amount to pay</dt>
                  <dd>
                    <strong>{formatMoney(checkoutInfo.localAmount, checkoutInfo.paymentCurrency)}</strong>
                  </dd>
                </div>
              </dl>
              <p className="panel-note">
                This is the exact amount sent to the payment provider. If the rate changes before you pay, open the
                invoice again to see and confirm the new amount.
              </p>
            </div>
          ) : null}

          {checkout.authorizationUrl ? (
            <div className="checkout-online">
              <p>Pay by card, bank transfer or USSD. The payment is confirmed instantly and the plan activates.</p>
              <a className="btn btn--primary btn--sm" href={checkout.authorizationUrl}>
                Pay {formatMoney(
                  checkoutInfo?.localAmount ?? checkout.payment.amount,
                  checkoutInfo?.paymentCurrency || checkout.payment.currency
                )} now
              </a>
              {checkout.payment.status === "pending" ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy === `verify-${checkout.payment.id}`}
                  onClick={() => verify(checkout.payment.id)}
                >
                  {busy === `verify-${checkout.payment.id}` ? "Checking…" : "I have paid — check now"}
                </button>
              ) : null}
            </div>
          ) : null}

          {checkout.onlineError ? (
            <div className="form-alert form-alert--error">
              The online payment page could not be opened ({checkout.onlineError}).
              {bank ? " Use the bank transfer details below." : " Please try again, or message us on WhatsApp (+234 906 392 4288)."}
            </div>
          ) : null}

          {bank ? (
            <div className="checkout-bank">
              <h3>Or pay by bank transfer</h3>
              <dl className="admin-facts">
                {bank.name ? <div><dt>Bank</dt><dd>{bank.name}</dd></div> : null}
                <div><dt>Account name</dt><dd>{bank.accountName}</dd></div>
                <div><dt>Account number</dt><dd>{bank.accountNumber}</dd></div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {formatMoney(
                      checkoutInfo?.localAmount ?? checkout.payment.amount,
                      checkoutInfo?.paymentCurrency || checkout.payment.currency
                    )}
                    {checkoutInfo?.local
                      ? ` (USD ${checkoutInfo.baseAmountUsd.toFixed(2)} at the rate shown above)`
                      : ""}
                  </dd>
                </div>
                <div><dt>Reference</dt><dd>{checkout.payment.reference}</dd></div>
              </dl>
              {bank.instructions ? <p className="panel-note">{bank.instructions}</p> : null}
              <form className="dash-form" onSubmit={submitReference}>
                <div className="field field--full">
                  <label htmlFor="payRef">Transfer reference / teller number</label>
                  <input
                    id="payRef"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="e.g. the reference on your transfer receipt"
                    maxLength={300}
                    required
                  />
                </div>
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy === "submit"}>
                  {busy === "submit" ? "Submitting…" : "I have paid — submit reference"}
                </button>
              </form>
              <p className="panel-note">
                Bank transfers are verified by the SBD team, and the plan activates as soon as they confirm it.
              </p>
            </div>
          ) : null}

          {!checkout.authorizationUrl && !bank ? (
            <div className="form-alert form-alert--error">
              No payment method is set up yet. Message us on WhatsApp (+234 906 392 4288) and we will take your payment
              and activate the plan.
            </div>
          ) : null}

          <div className="panel-actions">
            <button type="button" className="panel-link" onClick={() => setCheckout(null)}>
              Close
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Available plans</h2>
            <p>
              Prices are in USD. You pay in your local currency where card payments support it — the exact amount is
              shown before you confirm.
            </p>
          </div>
          <div className="field field--inline">
            <label htmlFor="billingCountry">Paying from</label>
            <select
              id="billingCountry"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} — {item.currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="plan-grid">
          {data.plans.map((plan) => {
            const current = plan.id === data.planId && data.active;
            return (
              <article className={`plan-card${current ? " is-current" : ""}`} key={plan.id}>
                <div className="plan-head">
                  <h3>{plan.name}</h3>
                  <span className="plan-price">
                    {plan.custom ? "Custom" : money(plan.price, plan.currency)}
                    <small>{plan.custom ? "" : "/month"}</small>
                  </span>
                </div>
                <p className="plan-billing">{plan.billingNote}</p>
                <ul className="plan-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                {plan.creditLimit != null && plan.creditLimit > 0 ? (
                  <p className="panel-note">
                    {plan.creditLimit.toLocaleString("en-GB")} SBD AI credits included each month · $1 of OpenAI use = 1,000 credits
                  </p>
                ) : null}
                {plan.custom && !current ? (
                  <a className="btn btn--ghost btn--sm" href={WHATSAPP} target="_blank" rel="noreferrer">
                    Talk to us
                  </a>
                ) : (
                  <button
                    type="button"
                    className={`btn btn--sm ${current ? "btn--ghost" : "btn--primary"}`}
                    disabled={current || busy === plan.id}
                    onClick={() => change(plan.id)}
                  >
                    {current
                      ? "Current plan"
                      : busy === plan.id
                        ? online
                          ? "Opening payment…"
                          : "Opening invoice…"
                        : plan.price > (data.plan?.price || 0)
                          ? "Upgrade"
                          : "Choose plan"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {data.active && data.status !== "canceled" ? (
          <div className="panel-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancel} disabled={busy === "cancel"}>
              Cancel subscription
            </button>
          </div>
        ) : null}
      </section>

      {pending.length ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Waiting for payment</h2>
            <p>Plans activate only after the payment is verified.</p>
          </div>
          <ul className="activity-list">
            {pending.map((payment) => (
              <li key={payment.id}>
                <strong>
                  {payment.reference || "Invoice"} · {formatMoney(
                    payment.localAmount ?? payment.amount,
                    payment.paymentCurrency || payment.currency
                  )}
                  {payment.paymentCurrency && payment.paymentCurrency !== "USD"
                    ? ` (USD ${Number(payment.baseAmountUsd || payment.amount).toFixed(2)})`
                    : ""}
                </strong>
                <span>
                  {payment.planId} plan · {payment.provider || ["paystack", "flutterwave"].includes(payment.method) ? "online" : "bank transfer"}
                  {payment.note ? ` · reference: ${payment.note}` : ""} ·{" "}
                  {payment.note ? "awaiting verification" : "awaiting payment"}
                </span>
                <span className="panel-actions">
                  {online ? (
                    <button
                      type="button"
                      className="panel-link"
                      disabled={busy === `verify-${payment.id}`}
                      onClick={() => verify(payment.id)}
                    >
                      {busy === `verify-${payment.id}` ? "Checking…" : "Check payment"}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Payment history</h2>
          <p>Invoices, payments and their verification.</p>
        </div>
        {data.payments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Plan</th>
                  <th>Price (USD)</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{dateFormat.format(new Date(payment.createdAt))}</td>
                    <td>{payment.reference || "—"}</td>
                    <td>{payment.planId}</td>
                    <td>{money(payment.baseAmountUsd || payment.amount, "USD")}</td>
                    <td>
                      {payment.localAmount != null
                        ? formatMoney(payment.localAmount, payment.paymentCurrency)
                        : money(payment.amount, payment.currency)}
                      {payment.fxRate && payment.paymentCurrency !== "USD" ? (
                        <span className="panel-note">1 USD = {Number(payment.fxRate).toFixed(2)} {payment.paymentCurrency}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`admin-pill${payment.status === "paid" ? "" : " admin-pill--muted"}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td>{payment.rejectedReason || payment.note || payment.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No payments yet.</div>
        )}
      </section>
    </div>
  );
}
