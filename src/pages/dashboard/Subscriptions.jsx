import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const money = (amount, currency) =>
  amount === 0 ? "Free" : `${currency} ${Number(amount).toFixed(2)}`;

const WHATSAPP =
  "https://wa.me/2349063924288?text=" +
  encodeURIComponent("Hello SBD AI Solutions, I would like to set up the Enterprise plan.");

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function Subscriptions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = () =>
    api("/subscriptions")
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function change(planId) {
    setBusy(planId);
    setError("");
    setNotice("");
    try {
      const next = await api("/subscriptions", { method: "POST", body: { planId } });
      setData((current) => ({ ...current, ...next }));
      setNotice(next.message);
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
      setData((current) => ({ ...current, ...next }));
      setNotice(next.message);
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

  return (
    <div className="dash-stack">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Your plan</h2>
            <p>
              {data.plan?.name} ·{" "}
              {data.plan?.custom
                ? data.plan?.billingNote || "Custom billing"
                : `${money(data.plan?.price || 0, data.plan?.currency || "USD")} per month`}
              {data.status === "canceled" ? " · cancelled" : ""}
            </p>
          </div>
          {data.status === "canceled" ? (
            <span className="admin-pill admin-pill--muted">Ends {dateFormat.format(new Date(data.currentPeriodEnd))}</span>
          ) : (
            <span className="admin-pill">Active</span>
          )}
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
              <span>Conversations this month</span>
              <strong>{data.usage.conversations}</strong>
            </div>
            <div className="usage-head">
              <span>Leads collected</span>
              <strong>{data.usage.leads}</strong>
            </div>
          </div>
        </div>

        <p className="panel-note">
          Renews on {dateFormat.format(new Date(data.currentPeriodEnd))}. Plans are billed by the SBD team; every change is
          recorded in your payment history below.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Available plans</h2>
          <p>Change whenever you like — upgrades and downgrades apply immediately.</p>
        </div>
        <div className="plan-grid">
          {data.plans.map((plan) => {
            const current = plan.id === data.planId;
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
                        ? "Changing…"
                        : plan.price > (data.plan?.price || 0)
                          ? "Upgrade"
                          : "Choose plan"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {data.status !== "canceled" ? (
          <div className="panel-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancel} disabled={busy === "cancel"}>
              Cancel subscription
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Payment history</h2>
          <p>Invoices and plan changes on your account.</p>
        </div>
        {data.payments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
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
                    <td>{payment.planId}</td>
                    <td>{money(payment.amount, payment.currency)}</td>
                    <td>
                      <span className={`admin-pill${payment.status === "paid" ? "" : " admin-pill--muted"}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td>{payment.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No payments yet — you are on the free plan.</div>
        )}
      </section>
    </div>
  );
}
