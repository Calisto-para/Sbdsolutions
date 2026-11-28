import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const when = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—");
const STATUSES = ["pending", "reviewing", "offer_sent", "awaiting_customer", "approved", "rejected", "completed"];
const blankOffer = { name: "", description: "", price: "", currency: "USD", billingPeriod: "one-off", credits: "", customerLimit: "", websiteLimit: "", assistantLimit: "", includedFeatures: "", conditions: "", expiresInDays: 14, zeroCost: false };

export default function AdminCustomRequests() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [offer, setOffer] = useState(blankOffer);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (value = status) => {
    try {
      const data = await api(`/admin/custom-requests?status=${encodeURIComponent(value)}`);
      setRows(data.requests || []);
    } catch (err) { setError(err.message); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const open = async (id) => {
    setError(""); setNotice("");
    try {
      const data = await api(`/admin/custom-requests/${id}`);
      setDetail(data);
      setNotes(data.request.adminNotes || "");
      setOffer(blankOffer);
    } catch (err) { setError(err.message); }
  };

  const saveStatus = async (next) => {
    setBusy(true); setError("");
    try {
      await api(`/admin/custom-requests/${detail.request.id}`, { method: "PATCH", body: { status: next, adminNotes: notes } });
      setNotice(`Marked ${next.replace(/_/g, " ")}.`);
      await open(detail.request.id); await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const sendOffer = async (event, send = true) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { ...offer, send };
      for (const key of ["credits", "customerLimit", "websiteLimit", "assistantLimit"]) if (!body[key]) delete body[key];
      await api(`/admin/custom-requests/${detail.request.id}/offers`, { method: "POST", body });
      setNotice(send ? "Offer sent to the customer." : "Draft saved.");
      await open(detail.request.id); await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const offerAction = async (row, action) => {
    setBusy(true);
    try {
      await api(`/admin/custom-requests/${detail.request.id}/offers/${row.id}`, { method: "PATCH", body: { action } });
      await open(detail.request.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <h2>Custom requests</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter requests">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert">{notice}</div> : null}
        {rows.length === 0 ? <p className="ticket-meta">No requests match this filter.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Request</th><th>Status</th><th>Offers</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.customer.name}</strong><span>{row.customer.email}</span></td>
                    <td>{row.title}<span>{row.kind} · {row.product}</span></td>
                    <td>{row.status.replace(/_/g, " ")}</td>
                    <td>{row.offerCount}</td>
                    <td>{when(row.updatedAt)}</td>
                    <td><button className="btn btn--ghost btn--sm" onClick={() => open(row.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail ? (
        <section className="panel">
          <div className="panel-head panel-head--row">
            <div>
              <h2>{detail.request.title}</h2>
              <p className="ticket-meta">{detail.request.customer.name} · {detail.request.customer.email} · {detail.request.kind} · {detail.request.product}</p>
            </div>
            <span className="admin-pill">{detail.request.status.replace(/_/g, " ")}</span>
          </div>
          <p>{detail.request.requirements}</p>
          <p className="ticket-meta">
            Usage: {detail.request.expectedUsage || "—"} · Budget: {detail.request.budget || "—"} · Billing: {detail.request.billingPreference || "—"} ·
            Websites: {detail.request.websites ?? "—"} · WhatsApp numbers: {detail.request.whatsappNumbers ?? "—"} · Submitted {when(detail.request.createdAt)}
          </p>

          <label>Internal notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="panel-actions">
            {STATUSES.filter((s) => s !== detail.request.status).map((s) => (
              <button key={s} className="btn btn--ghost btn--sm" disabled={busy} onClick={() => saveStatus(s)}>{s.replace(/_/g, " ")}</button>
            ))}
          </div>

          <h3>Offers</h3>
          {detail.offers.length === 0 ? <p className="ticket-meta">No offer yet.</p> : detail.offers.map((row) => (
            <div key={row.id} className="panel panel--nested">
              <strong>{row.name} — {row.currency} {row.price.toFixed(2)} {row.billingPeriod !== "one-off" ? `/${row.billingPeriod}` : "(one-off)"}</strong>
              <p className="ticket-meta">Status: {row.status} · expires {when(row.expiresAt)}{row.revisionNote ? ` · note: ${row.revisionNote}` : ""}</p>
              <p>{row.description}</p>
              {["draft", "sent", "revision_requested", "declined", "withdrawn"].includes(row.status) ? (
                <div className="panel-actions">
                  {row.status !== "sent" ? <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => offerAction(row, "send")}>Send</button> : null}
                  {row.status === "sent" ? <button className="btn btn--ghost btn--sm btn--danger" disabled={busy} onClick={() => offerAction(row, "withdraw")}>Withdraw</button> : null}
                </div>
              ) : null}
            </div>
          ))}

          <h3>New offer</h3>
          <form className="form-grid" onSubmit={(e) => sendOffer(e, true)}>
            <label>Name<input required value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} /></label>
            <label>Price<input required type="number" min="0.01" step="0.01" value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} /></label>
            <label>Currency
              <select value={offer.currency} onChange={(e) => setOffer({ ...offer, currency: e.target.value })}><option>USD</option><option>NGN</option></select>
            </label>
            <label>Billing
              <select value={offer.billingPeriod} onChange={(e) => setOffer({ ...offer, billingPeriod: e.target.value })}>
                <option value="one-off">One-off</option><option value="monthly">Monthly</option><option value="annual">Annual</option>
              </select>
            </label>
            <label>Credits<input type="number" min="0" value={offer.credits} onChange={(e) => setOffer({ ...offer, credits: e.target.value })} /></label>
            <label>Customer limit<input type="number" min="0" value={offer.customerLimit} onChange={(e) => setOffer({ ...offer, customerLimit: e.target.value })} /></label>
            <label>Website limit<input type="number" min="0" value={offer.websiteLimit} onChange={(e) => setOffer({ ...offer, websiteLimit: e.target.value })} /></label>
            <label>AI agent limit<input type="number" min="0" value={offer.assistantLimit} onChange={(e) => setOffer({ ...offer, assistantLimit: e.target.value })} /></label>
            <label className="form-grid__full admin-check">
              <input type="checkbox" checked={offer.zeroCost} onChange={(e) => setOffer({ ...offer, zeroCost: e.target.checked, price: e.target.checked ? "0" : offer.price })} />
              Zero-cost offer (activates allowances on acceptance without payment)
            </label>
            <label>Valid for (days)<input type="number" min="1" max="120" value={offer.expiresInDays} onChange={(e) => setOffer({ ...offer, expiresInDays: e.target.value })} /></label>
            <label className="form-grid__full">Description<textarea rows={2} value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} /></label>
            <label className="form-grid__full">Included features<input value={offer.includedFeatures} onChange={(e) => setOffer({ ...offer, includedFeatures: e.target.value })} placeholder="Separate features with commas" /></label>
            <label className="form-grid__full">Conditions<textarea rows={2} value={offer.conditions} onChange={(e) => setOffer({ ...offer, conditions: e.target.value })} /></label>
            <div className="panel-actions form-grid__full">
              <button className="btn btn--primary" disabled={busy}>Send offer</button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={(e) => sendOffer(e, false)}>Save draft</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
