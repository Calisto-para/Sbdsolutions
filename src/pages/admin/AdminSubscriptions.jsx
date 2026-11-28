import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const when = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—");

export default function AdminSubscriptions() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      const data = await api(`/admin/subscriptions?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`);
      setRows(data.subscriptions || []);
      setPlans(data.plans || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const change = async (row, patch) => {
    setBusy(row.userId);
    setError("");
    setNotice("");
    try {
      const data = await api(`/admin/subscriptions/${row.userId}`, { method: "PATCH", body: patch });
      setNotice(`${row.customer.name}: ${data.message || "updated"}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Subscriptions</h2>
            <p>
              Live subscription records. Changing a plan or status here updates the customer’s account immediately and
              is written to the audit log.
            </p>
          </div>
          <div className="admin-filters">
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              {["", "active", "canceled", "past_due", "expired"].map((value) => (
                <option key={value || "all"} value={value}>{value ? value : "All statuses"}</option>
              ))}
            </select>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") load(); }}
              placeholder="Search name or email"
              aria-label="Search subscriptions"
            />
            <button type="button" className="btn btn--outline btn--sm" onClick={load}>Search</button>
          </div>
        </div>

        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert">{notice}</div> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Price</th>
                <th>Status</th>
                <th>Renews / ends</th>
                <th>Credits</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7}>No subscriptions match this filter.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    {row.customer.name}
                    <small>{row.customer.email}</small>
                  </td>
                  <td>{row.planName}</td>
                  <td>{row.currency} {row.price.toFixed(2)}</td>
                  <td><span className={`ticket-status ticket-status--${row.status === "active" ? "open" : row.status === "resolved" ? "resolved" : "pending"}`}>{row.status}</span></td>
                  <td>{when(row.currentPeriodEnd)}</td>
                  <td>{row.creditsUsed.toLocaleString()}{row.creditLimit ? ` / ${row.creditLimit.toLocaleString()}` : ""}</td>
                  <td>
                    <div className="admin-filters">
                      <select
                        value={row.status}
                        disabled={busy === row.userId}
                        onChange={(event) => change(row, { status: event.target.value })}
                        aria-label={`Status for ${row.customer.name}`}
                      >
                        {["active", "canceled", "past_due", "expired"].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <select
                        value={row.planId}
                        disabled={busy === row.userId}
                        onChange={(event) => change(row, { planId: event.target.value })}
                        aria-label={`Plan for ${row.customer.name}`}
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.name}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ticket-meta">
          Cancel-at-period-end and renewal dates are preserved; changing a plan does not reset the customer’s used
          credits or billing period.
        </p>
      </section>
    </div>
  );
}
