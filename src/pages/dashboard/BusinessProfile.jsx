import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

const EMPTY = { name: "", industry: "", website: "", description: "", supportEmail: "", phone: "", address: "" };

export default function BusinessProfile() {
  const { setBusiness } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/business")
      .then((data) => {
        if (data.business) setForm({ ...EMPTY, ...data.business });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api("/business", { method: "PUT", body: form });
      setBusiness(data.business);
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="dash-loading">Loading business details…</div>;

  return (
    <section className="panel panel--form">
      <div className="panel-head">
        <h2>Business details</h2>
        <p>Your assistants use this information when answering customer questions.</p>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <form className="dash-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="bizName">Business name</label>
            <input id="bizName" value={form.name} onChange={update("name")} placeholder="SBD AI Solutions" />
          </div>
          <div className="field">
            <label htmlFor="bizIndustry">Industry</label>
            <input id="bizIndustry" value={form.industry} onChange={update("industry")} placeholder="Technology" />
          </div>
          <div className="field">
            <label htmlFor="bizWebsite">Website</label>
            <input id="bizWebsite" value={form.website} onChange={update("website")} placeholder="https://example.com" />
          </div>
          <div className="field">
            <label htmlFor="bizEmail">Support email</label>
            <input id="bizEmail" type="email" value={form.supportEmail} onChange={update("supportEmail")} placeholder="support@example.com" />
          </div>
          <div className="field">
            <label htmlFor="bizPhone">Phone</label>
            <input id="bizPhone" value={form.phone} onChange={update("phone")} placeholder="+234 000 000 0000" />
          </div>
          <div className="field">
            <label htmlFor="bizAddress">Address</label>
            <input id="bizAddress" value={form.address} onChange={update("address")} placeholder="City, country" />
          </div>
          <div className="field field--full">
            <label htmlFor="bizDescription">What the business does</label>
            <textarea id="bizDescription" rows="5" value={form.description} onChange={update("description")} placeholder="Describe your business in a few sentences." />
          </div>
        </div>
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save business details"}
        </button>
      </form>
    </section>
  );
}
