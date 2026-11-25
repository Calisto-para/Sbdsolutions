import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

const money = (amount, currency) => `${currency} ${Number(amount || 0).toFixed(2)}`;

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

  /* Returning from the payment page: confirm the payment straight away. */
  useEffect(() => {
    if (!data) return;
    const id = new URLSearchParams(window.location.search).get("payment");
    if (id) verify(id);
  }, [data?.planId]);

  async function change(planId) {
    setBusy(planId);
    setError("");
    setNotice("");
    try {
      const next = await api("/subscriptions", { method: "POST", body: { planId } });
      setCheckout(next);
      setReference("");
      setNotice(next.message);
      await load();
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

  const messagePercent = Math.min(100, Math.round((data.usage.messages / Math.max(1, data.usage.messageLimit)) * 100));
  const assistantPercent = Math.min(100, Math.round((data.usage.assistants / Math.max(1, data.usage.assistantLimit)) * 100));
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
              <span>Messages this month</span>
              <strong>{data.usage.messages} / {data.usage.messageLimit}</strong>
            </div>
            <div className="usage-bar"><span style={{ width: `${messagePercent}%` }} /></div>
          </div>
          <div className="usage-item">
            <div className="usage-head">
              <span>AI assistants</span>
              <strong>{data.usage.assistants} / {data.usage.assistantLimit}</strong>
            </div>
            <div className="usage-bar"><span style={{ width: `${assistantPercent}%` }} /></div>
          </div>
          <div className="usage-item">
            <div className="usage-head">
              <span>AI tokens this month</span>
              <strong>{data.usage.tokensUsed} / {data.usage.tokenLimit?.toLocaleString("en-GB") || "∞"}</strong>
            </div>
            <div className="usage-bar"><span style={{ width: `${data.usage.tokenLimit ? Math.min(100, Math.round((data.usage.tokensUsed / Math.max(1, data.usage.tokenLimit)) * 100)) : 0}%` }} /></div>
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
              Invoice <strong>{checkout.payment.reference}</strong> ·{" "}
              {money(checkout.payment.amount, checkout.payment.currency)}
            </p>
          </div>

          {checkout.authorizationUrl ? (
            <div className="checkout-online">
              <p>Pay by card, bank transfer or USSD. The payment is confirmed instantly and the plan activates.</p>
              <a className="btn btn--primary btn--sm" href={checkout.authorizationUrl}>
                Pay {money(checkout.payment.amount, checkout.payment.currency)} now
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
              The online payment page could not be opened ({checkout.onlineError}). Use the bank transfer details below.
            </div>
          ) : null}

          {bank ? (
            <div className="checkout-bank">
              <h3>Or pay by bank transfer</h3>
              <dl className="admin-facts">
                {bank.name ? <div><dt>Bank</dt><dd>{bank.name}</dd></div> : null}
                <div><dt>Account name</dt><dd>{bank.accountName}</dd></div>
                <div><dt>Account number</dt><dd>{bank.accountNumber}</dd></div>
                <div><dt>Amount</dt><dd>{money(checkout.payment.amount, checkout.payment.currency)}</dd></div>
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
        <div className="panel-head">
          <h2>Available plans</h2>
          <p>Payment is required — choosing a plan opens an invoice, it does not activate the plan by itself.</p>
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
                {plan.tokenLimit > 0 && !plan.tokenPriceHidden ? (
                  <p className="panel-note">{plan.tokenLimit.toLocaleString("en-GB")} AI tokens included each month</p>
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
                        ? "Opening invoice…"
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
                <strong>{payment.reference || "Invoice"} · {money(payment.amount, payment.currency)}</strong>
                <span>
                  {payment.planId} plan · {payment.method === "paystack" ? "online" : "bank transfer"}
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
                  <th>Amount</th>
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
                    <td>{money(payment.amount, payment.currency)}</td>
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
