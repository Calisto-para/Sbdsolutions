import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { shortDate } from "./AdminOverview";

const money = (amount, currency) => `${currency} ${Number(amount || 0).toFixed(2)}`;

/* Verify the money before a plan activates. An operator confirms a bank
   transfer (or an online payment the provider has not confirmed). */
export default function AdminPayments() {
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = (nextStatus = status, search = query) => {
    setError("");
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (search.trim()) params.set("q", search.trim());
    api(`/admin/payments?${params}`)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  async function verify(id) {
    if (!window.confirm("Verify this payment and activate the plan?")) return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const result = await api(`/admin/payments/${id}/verify`, { method: "POST" });
      setNotice(result.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function reject(id) {
    const reason = window.prompt("Why is this payment rejected? (shown to the customer)", "Not received");
    if (reason === null) return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const result = await api(`/admin/payments/${id}/reject`, { method: "POST", body: { reason } });
      setNotice(result.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Payments</h2>
            <p>Plans activate only when a payment is verified here (or instantly by the payment provider).</p>
          </div>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load();
            }}
          >
            <input
              type="search"
              placeholder="Customer, email or reference"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search payments"
            />
            <button type="submit" className="btn btn--ghost btn--sm">Search</button>
          </form>
        </div>

        <div className="filters">
          {[
            ["pending", "Awaiting verification"],
            ["paid", "Verified"],
            ["rejected", "Rejected"],
            ["", "All"],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={`btn btn--sm ${status === value ? "btn--primary" : "btn--ghost"}`}
              onClick={() => {
                setStatus(value);
                load(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

        {!data ? (
          <div className="dash-loading">Loading payments…</div>
        ) : data.payments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.customerName}</strong>
                      <span>{payment.customerEmail}</span>
                    </td>
                    <td>{payment.planName}</td>
                    <td>{money(payment.amount, payment.currency)}</td>
                    <td>
                      <strong>{payment.reference || "—"}</strong>
                      <span>{payment.method === "paystack" ? "online" : "bank transfer"}</span>
                    </td>
                    <td>
                      {payment.note || "—"}
                      <span>{shortDate(payment.createdAt)}</span>
                    </td>
                    <td>
                      <span className={`admin-pill${payment.status === "paid" ? "" : " admin-pill--muted"}`}>
                        {payment.status}
                      </span>
                      {payment.rejectedReason ? <span>{payment.rejectedReason}</span> : null}
                    </td>
                    <td>
                      {payment.status === "pending" ? (
                        <div className="panel-actions">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={busy === payment.id}
                            onClick={() => verify(payment.id)}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm btn--danger"
                            disabled={busy === payment.id}
                            onClick={() => reject(payment.id)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="admin-stat-note">{payment.verifiedAt ? shortDate(payment.verifiedAt) : "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No payments in this view.</div>
        )}
      </section>
    </div>
  );
}
