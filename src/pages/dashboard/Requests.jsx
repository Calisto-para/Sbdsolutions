import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const when = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—");
const empty = { kind: "service", product: "Website chatbot", title: "", requirements: "", expectedUsage: "", budget: "", billingPreference: "", websites: "", whatsappNumbers: "" };

export default function Requests({ user }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ ...empty, email: user?.email || "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({});

  const load = async () => {
    try {
      const data = await api("/custom-requests");
      setRows(data.requests || []);
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { ...form };
      if (!body.websites) delete body.websites;
      if (!body.whatsappNumbers) delete body.whatsappNumbers;
      await api("/custom-requests", { method: "POST", body });
      setNotice("Request submitted. Our team will review it and send an offer.");
      setForm({ ...empty, email: user?.email || "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const respond = async (request, offer, action) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api(`/custom-requests/${request.id}/offers/${offer.id}/respond`, {
        method: "POST",
        body: { action, note: note[offer.id] || "" },
      });
      setNotice(result.message || "Saved.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dash-stack">
      <section className="panel">
        <h2>Request a custom plan</h2>
        <p className="ticket-meta">
          Need higher allowances, several websites or WhatsApp messaging beyond the standard plans? Describe it here.
          We review every request and reply with a written offer. Nothing is charged until you accept an offer and pay
          its invoice.
        </p>
        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert">{notice}</div> : null}
        <form className="form-grid" onSubmit={submit}>
          <label>Request type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="service">One-off service or project</option>
              <option value="subscription">Custom subscription</option>
            </select>
          </label>
          <label>Product
            <select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
              {["Website chatbot", "WhatsApp messaging", "Website/chatbot + WhatsApp", "Other"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 5 websites with 40k credits" />
          </label>
          <label>Contact email
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>Expected monthly usage
            <input value={form.expectedUsage} onChange={(e) => setForm({ ...form, expectedUsage: e.target.value })} placeholder="Conversations, replies, credits…" />
          </label>
          <label>Budget (optional)
            <input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="e.g. $100/month" />
          </label>
          <label>Billing preference (optional)
            <input value={form.billingPreference} onChange={(e) => setForm({ ...form, billingPreference: e.target.value })} placeholder="Monthly, annual, one-off" />
          </label>
          <label>Websites
            <input type="number" min="0" value={form.websites} onChange={(e) => setForm({ ...form, websites: e.target.value })} />
          </label>
          <label>WhatsApp numbers
            <input type="number" min="0" value={form.whatsappNumbers} onChange={(e) => setForm({ ...form, whatsappNumbers: e.target.value })} />
          </label>
          <label className="form-grid__full">Requirements
            <textarea required minLength={20} rows={5} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Tell us exactly what you need, what you have today and any deadlines." />
          </label>
          <div className="form-grid__full">
            <button className="btn btn--primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Your requests</h2>
        {rows.length === 0 ? <p className="ticket-meta">No requests yet.</p> : (
          <div className="dash-stack">
            {rows.map((request) => (
              <article key={request.id} className="panel panel--nested">
                <div className="panel-head panel-head--row">
                  <div>
                    <h3>{request.title}</h3>
                    <p className="ticket-meta">{request.kind === "subscription" ? "Custom subscription" : "Service"} · {request.product || "General"} · submitted {when(request.createdAt)}</p>
                  </div>
                  <span className="ticket-status">{request.status.replace(/_/g, " ")}</span>
                </div>
                <p>{request.requirements}</p>
                {request.offers.length === 0 ? <p className="ticket-meta">No offer yet — we are reviewing your request.</p> : request.offers.map((offer) => (
                  <div key={offer.id} className="dash-stack">
                    <h4>{offer.name} — {offer.currency} {offer.price.toFixed(2)} {offer.billingPeriod !== "one-off" ? `/ ${offer.billingPeriod}` : "(one-off)"}</h4>
                    <p>{offer.description}</p>
                    {offer.includedFeatures ? <p className="ticket-meta">Includes: {offer.includedFeatures}</p> : null}
                    {offer.conditions ? <p className="ticket-meta">Conditions: {offer.conditions}</p> : null}
                    <p className="ticket-meta">
                      {offer.credits ? `${offer.credits.toLocaleString()} credits · ` : ""}
                      {offer.websiteLimit ? `${offer.websiteLimit} websites · ` : ""}
                      {offer.customerLimit ? `${offer.customerLimit.toLocaleString()} customers · ` : ""}
                      {offer.assistantLimit || offer.websiteLimit ? `${offer.assistantLimit || offer.websiteLimit} AI agents/websites · ` : ""}
                      offer {offer.status} · expires {when(offer.expiresAt)}
                    </p>
                    {offer.status === "sent" ? (
                      <div className="dash-stack">
                        <textarea rows={2} placeholder="Optional note for the team (required for a revision)" value={note[offer.id] || ""} onChange={(e) => setNote({ ...note, [offer.id]: e.target.value })} />
                        <div className="panel-actions">
                          <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond(request, offer, "accept")}>Accept offer</button>
                          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => respond(request, offer, "revision")}>Request changes</button>
                          <button className="btn btn--ghost btn--sm btn--danger" disabled={busy} onClick={() => respond(request, offer, "decline")}>Decline</button>
                        </div>
                      </div>
                    ) : null}
                    {offer.zeroCost ? <p className="ticket-meta">Zero-cost offer — approved by SBD, no payment required.</p> : null}
                    {offer.status === "accepted" ? (
                      <p className="ticket-meta">Accepted — pay invoice SBD-CR-{offer.id.slice(0, 8).toUpperCase()} from your Subscription page. Approval follows verified payment.</p>
                    ) : null}
                    {offer.revisionNote ? <p className="ticket-meta">Your note: {offer.revisionNote}</p> : null}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
