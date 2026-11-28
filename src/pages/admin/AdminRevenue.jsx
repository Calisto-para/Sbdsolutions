import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function AdminRevenue() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api(`/admin/revenue?days=${days}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [days]);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading revenue…</div>;

  const stats = [
    { label: "Collected in period", value: money(data.revenue.collectedInRange), note: `${data.days} days · USD` },
    { label: "Net of refunds", value: money(data.revenue.netInRange ?? data.revenue.collectedInRange), note: `${data.refunds?.count ?? 0} refund(s) · ${money(data.refunds?.usd ?? 0)}` },
    { label: "Collected all time", value: money(data.revenue.collectedAllTime), note: "verified payments only" },
    { label: "Monthly recurring revenue", value: money(data.revenue.mrr), note: `${data.revenue.activePayingCustomers} paying customers` },
    { label: "Projected annual run-rate", value: money(data.revenue.arrProjected), note: "projection, not collected" },
    { label: "Outstanding payments", value: String(data.payments.pending), note: money(data.payments.pendingAmount) },
    { label: "Failed payments", value: String(data.payments.failed), note: money(data.payments.failedAmount) },
    { label: "New customers", value: String(data.customers.newInRange), note: `${data.customers.total} total` },
    { label: "Cancelled subscriptions", value: String(data.customers.cancelled), note: "in period" },
  ];

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Revenue and financial overview</h2>
            <p>
              Every figure is calculated from stored payments, subscriptions and plans. Projections are labelled;
              non-USD payments are counted separately rather than converted at an assumed rate.
            </p>
          </div>
          <div className="admin-filters">
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Reporting period">
              {[30, 90, 180, 365].map((value) => (
                <option key={value} value={value}>Last {value} days</option>
              ))}
            </select>
            <a className="btn btn--outline btn--sm" href={`/api/admin/revenue/export.csv?days=${days}`}>Export CSV</a>
          </div>
        </div>

        <div className="stat-grid admin-stat-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
              <span className="ticket-meta">{stat.note}</span>
            </div>
          ))}
        </div>

        <p className="ticket-meta">
          Other-currency payments in period: {data.revenue.otherCurrencyInRange.toFixed(2)} (not converted).
          Estimated average revenue per paying customer: {money(data.revenue.arpuEstimate)}.
          Renewals due in the next 30 days: {data.renewalsNext30Days}.
        </p>
      </section>

      <div className="dash-columns">
        <section className="panel">
          <div className="panel-head"><h2>Revenue by plan</h2></div>
          <table className="admin-table">
            <thead><tr><th>Plan</th><th>Payments</th><th>USD</th></tr></thead>
            <tbody>
              {data.byPlan.length === 0 ? <tr><td colSpan={3}>No verified payments in this period.</td></tr> : data.byPlan.map((row) => (
                <tr key={row.name}><td>{row.name}</td><td>{row.payments}</td><td>{money(row.usd)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Revenue by payment type</h2></div>
          <table className="admin-table">
            <thead><tr><th>Type</th><th>Payments</th><th>USD</th></tr></thead>
            <tbody>
              {data.byKind.length === 0 ? <tr><td colSpan={3}>No verified payments in this period.</td></tr> : data.byKind.map((row) => (
                <tr key={row.kind}><td>{row.kind}</td><td>{row.payments}</td><td>{money(row.usd)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Monthly revenue</h2><p>Confirmed USD payments by month, last 12 months.</p></div>
        <table className="admin-table">
          <thead><tr><th>Month</th><th>Payments</th><th>USD</th></tr></thead>
          <tbody>
            {data.byMonth.length === 0 ? <tr><td colSpan={3}>No verified payments recorded yet.</td></tr> : data.byMonth.map((row) => (
              <tr key={row.month}><td>{row.month}</td><td>{row.payments}</td><td>{money(row.usd)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Product usage</h2><p>Actual records for the current calendar month.</p></div>
        <div className="stat-grid admin-stat-grid">
          <div className="stat-card"><span className="stat-value">{data.usage.creditsUsed.toLocaleString()}</span><span className="stat-label">AI credits used (all customers)</span></div>
          <div className="stat-card"><span className="stat-value">{data.usage.conversationsThisMonth}</span><span className="stat-label">Conversations this month</span></div>
          <div className="stat-card"><span className="stat-value">{data.usage.messagesThisMonth}</span><span className="stat-label">Messages this month</span></div>
          <div className="stat-card"><span className="stat-value">{data.usage.leadsThisMonth}</span><span className="stat-label">Leads captured</span></div>
          <div className="stat-card"><span className="stat-value">{money(data.usage.aiSpendEstimate)}</span><span className="stat-label">Recorded AI spend (internal estimate)</span></div>
        </div>
        <p className="ticket-meta">
          AI spend is the internal amount already recorded against subscriptions. WhatsApp messaging costs are not
          shown because the product is not connected; no figures are estimated in their place.
        </p>
      </section>
    </div>
  );
}
