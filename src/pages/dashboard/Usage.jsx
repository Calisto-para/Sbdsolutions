import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { COUNTRIES, findCountry, formatMoney } from "../../../shared/currencies";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const num = (value, decimals = 0) =>
  Number(value || 0).toLocaleString("en-GB", { maximumFractionDigits: decimals });

const percent = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

const barTone = (value) => (value >= 100 ? "critical" : value >= 85 ? "danger" : value >= 70 ? "warn" : "");

const WHATSAPP =
  "https://wa.me/2349063924288?text=" +
  encodeURIComponent("Hello SBD Solutions, I would like to discuss my plan.");

export default function Usage({ onNavigate }) {
  const [data, setData] = useState(null);
  const [upgrades, setUpgrades] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [country, setCountry] = useState("US");

  const load = () =>
    Promise.all([api("/usage"), api("/usage/upgrades").catch(() => null)])
      .then(([overview, options]) => {
        setData(overview);
        setUpgrades(options);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  /* Returning from the payment page: verify once, server-side, then refresh the
     real balances. Nothing is trusted from the redirect itself. */
  const returned = useRef("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("payment");
    if (!id || returned.current === id) return;
    returned.current = id;
    params.delete("payment");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    setBusy("verify");
    api(`/subscriptions/payments/${id}/verify`, { method: "POST" })
      .then((result) => {
        setNotice(result.message || "Payment checked.");
        return load();
      })
      .catch((err) => setError(err.message))
      .then(() => setBusy(""));
  }, []);

  const creditTone = useMemo(() => percent(data?.credits?.percent), [data]);
  const customerTone = useMemo(() => percent(data?.customers?.percent), [data]);

  if (error && !data) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading your usage…</div>;

  async function upgrade(planId) {
    setBusy(`upgrade-${planId}`);
    setError("");
    setNotice("");
    try {
      const result = await api("/subscriptions/upgrade", {
        method: "POST",
        body: { planId, country },
      });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function buyCredits(packageId) {
    setBusy(`credits-${packageId}`);
    setError("");
    setNotice("");
    try {
      const result = await api(`/subscriptions/credits/${packageId}/purchase`, {
        method: "POST",
        body: { country },
      });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const plan = data.plan || {};
  const credits = data.credits;
  const customers = data.customers;
  const packages = data.creditPackages || [];
  const countryName = findCountry(country)?.name || "";

  return (
    <div className="dash-stack usage-page">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      {data.warnings?.length ? (
        <div className="usage-warnings">
          {data.warnings.map((warning) => (
            <div key={`${warning.kind}-${warning.threshold}`} className={`usage-warning usage-warning--${warning.level}`}>
              <strong>{warning.title}</strong>
              <span>{warning.body}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>{plan.name || "Your"} plan</h2>
            <p>
              {plan.custom
                ? plan.billingNote || "Custom billing"
                : `${formatMoney(plan.price, plan.currency || "USD")} per month`}
              {data.active ? "" : " · not active"}
              {data.cancelAtPeriodEnd ? " · cancels at renewal" : ""}
              {plan.custom && data.renewalDate
                ? ` · renews ${new Date(data.renewalDate).toLocaleDateString("en-GB", { dateStyle: "medium" })}`
                : ""}
            </p>
          </div>
          <div className="usage-head-actions">
            <button type="button" className="panel-link" onClick={() => onNavigate?.({ tab: "notifications" })}>
              Notification centre{data.unreadNotifications ? ` (${data.unreadNotifications})` : ""}
            </button>
            <span className={`admin-pill${data.active ? "" : " admin-pill--muted"}`}>
              Plan {data.active ? "active" : "inactive"}
            </span>
          </div>
        </div>

        <div className="usage-stat-grid">
          <div className="usage-stat">
            <span className="usage-stat-label">AI credits allocated</span>
            <strong>{credits.unlimited ? "Custom" : num(credits.allowance)}</strong>
            <small>
              {credits.unlimited
                ? "By agreement"
                : `${num(credits.planAllowance)} plan${credits.purchased ? ` + ${num(credits.purchased)} purchased` : ""}`}
            </small>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-label">Credits consumed</span>
            <strong>{num(credits.used, 1)}</strong>
            <small>{credits.unlimited ? "No monthly cap" : `${creditTone}% of allowance`}</small>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-label">Credits remaining</span>
            <strong>{credits.unlimited ? "Unlimited" : num(credits.remaining, 1)}</strong>
            <small>{credits.exhausted ? "Limit reached" : "Available this month"}</small>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-label">Unique customers used</span>
            <strong>
              {num(customers.used)} <span className="usage-of">/ {num(customers.limit)}</span>
            </strong>
            <small>{customerTone}% of allowance</small>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-label">Remaining customers</span>
            <strong>{num(customers.remaining)}</strong>
            <small>{customers.exhausted ? "Limit reached" : "New customers this period"}</small>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-label">Renews on</span>
            <strong>{data.renewalDate ? dateFormat.format(new Date(data.renewalDate)) : "—"}</strong>
            <small>{data.cancelAtPeriodEnd ? "Cancelled — access ends this date" : "Next billing date"}</small>
          </div>
        </div>

        <div className="usage-meter">
          <div className="usage-head">
            <span>AI credit usage</span>
            <strong>
              {credits.unlimited
                ? "Custom allowance"
                : `${num(credits.used, 1)} / ${num(credits.allowance)} · ${creditTone}%`}
            </strong>
          </div>
          <div className={`usage-bar usage-bar--lg ${barTone(creditTone)}`}>
            <span style={{ width: `${creditTone}%` }} />
          </div>
          {credits.exhausted ? (
            <p className="usage-note usage-note--critical">
              You have reached your monthly AI credit limit. Upgrade your subscription or purchase additional
              credits to continue. Your conversations and history are kept.
            </p>
          ) : creditTone >= 70 ? (
            <p className="usage-note">
              Credits used: {num(credits.used, 1)} of {num(credits.allowance)}.{" "}
              {creditTone >= 95 ? "Upgrade or buy extra credits to avoid interruption." : "Keep an eye on the remaining allowance."}
            </p>
          ) : null}
        </div>

        <div className="usage-meter">
          <div className="usage-head">
            <span>Unique-customer allowance</span>
            <strong>
              {num(customers.used)} / {num(customers.limit)} · {customerTone}%
            </strong>
          </div>
          <div className={`usage-bar usage-bar--lg ${barTone(customerTone)}`}>
            <span style={{ width: `${customerTone}%` }} />
          </div>
          {customers.exhausted ? (
            <p className="usage-note usage-note--critical">
              You have reached this month's unique-customer limit. Existing customers can still continue their
              conversations, but new customers are paused until you upgrade or the period renews.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Upgrade your plan</h2>
            <p>
              {upgrades?.policy ||
                "Upgrades charge only the difference for the days left in your current billing period."}
            </p>
          </div>
          <div className="field field--inline">
            <label htmlFor="usageCountry">Paying from</label>
            <select id="usageCountry" value={country} onChange={(event) => setCountry(event.target.value)}>
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} — {item.currency}
                </option>
              ))}
            </select>
          </div>
        </div>

        {upgrades?.options?.length ? (
          <div className="upgrade-grid">
            {upgrades.options.map((option) => (
              <article className="upgrade-card" key={option.id}>
                <div className="plan-head">
                  <h3>{option.name}</h3>
                  <span className="plan-price">
                    ${option.price}
                    <small>/month</small>
                  </span>
                </div>
                <dl className="upgrade-facts">
                  <div>
                    <dt>Monthly price</dt>
                    <dd>${option.price.toFixed(2)} after the upgrade</dd>
                  </div>
                  <div>
                    <dt>Credits</dt>
                    <dd>{num(option.creditLimit)} per month</dd>
                  </div>
                  <div>
                    <dt>Unique customers</dt>
                    <dd>{num(option.customerLimit)} per month</dd>
                  </div>
                  <div>
                    <dt>Unused value today</dt>
                    <dd>
                      ${option.quote.unusedValue.toFixed(2)} ({option.quote.remainingDays} day
                      {option.quote.remainingDays === 1 ? "" : "s"} left)
                    </dd>
                  </div>
                  <div className="upgrade-due">
                    <dt>Pay today</dt>
                    <dd>
                      ${option.quote.amountDue.toFixed(2)}
                      {country !== "US" ? <span className="panel-note">Charged in {findCountry(country)?.currency} at the live rate</span> : null}
                    </dd>
                  </div>
                </dl>
                <p className="panel-note">
                  Activated only after the payment is verified. Your renewal date stays{" "}
                  {data.renewalDate ? dateFormat.format(new Date(data.renewalDate)) : "the same"}; used and
                  purchased credits are kept.
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={Boolean(busy)}
                  onClick={() => upgrade(option.id)}
                >
                  {busy === `upgrade-${option.id}` ? "Opening payment…" : `Upgrade to ${option.name}`}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            {plan.custom
              ? "Your Enterprise plan is managed by agreement. Message the team to change it."
              : "You are on the highest standard plan."}{" "}
            <a className="panel-link" href={WHATSAPP} target="_blank" rel="noreferrer">
              Talk to us
            </a>
          </div>
        )}
        {country !== "US" && countryName ? (
          <p className="panel-note">
            Card payments from {countryName} may be charged in {findCountry(country)?.currency} using the live
            rate. The exact amount is confirmed on the payment page.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Additional AI credits</h2>
          <p>
            Extra credits are added on top of your monthly plan allowance and are kept separate. They are not
            reset at renewal.
          </p>
        </div>

        {packages.length ? (
          <div className="credit-grid">
            {packages.map((pack) => (
              <article className="credit-card" key={pack.id}>
                <span className="credit-amount">{num(pack.credits)}</span>
                <span className="credit-label">SBD AI credits</span>
                <strong className="credit-price">{formatMoney(pack.price, pack.currency || "USD")}</strong>
                <p className="panel-note">Added after the payment is verified. No plan change required.</p>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={Boolean(busy) || !data.paymentEnabled}
                  onClick={() => buyCredits(pack.id)}
                >
                  {busy === `credits-${pack.id}` ? "Opening payment…" : "Buy credits"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            Additional credit packs are not available yet. Purchasing stays disabled until an administrator
            configures the pack prices and quantities.
          </div>
        )}

        {data.creditPurchases?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Credits added</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {data.creditPurchases.map((purchase, index) => (
                  <tr key={`${purchase.createdAt}-${index}`}>
                    <td>{dateFormat.format(new Date(purchase.createdAt))}</td>
                    <td>{num(purchase.credits)}</td>
                    <td>{formatMoney(purchase.price, purchase.currency || "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {busy === "verify" ? <p className="panel-note">Checking your payment with the provider…</p> : null}
    </div>
  );
}
