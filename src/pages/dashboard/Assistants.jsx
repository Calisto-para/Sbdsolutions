import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const TONES = [
  ["friendly", "Friendly and helpful"],
  ["professional", "Professional"],
  ["concise", "Short and concise"],
  ["formal", "Formal"],
];

const EMPTY = {
  name: "",
  businessDescription: "",
  services: "",
  products: "",
  tone: "friendly",
  language: "English",
  greeting: "",
  instructions: "",
};

export default function Assistants({ onOpen }) {
  const [assistants, setAssistants] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/assistants")
      .then((data) => setAssistants(data.assistants))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/assistants", { method: "POST", body: form });
      setForm(EMPTY);
      setCreating(false);
      await load();
      onOpen(data.assistant.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!assistants) return error ? <div className="form-alert form-alert--error">{error}</div> : <div className="dash-loading">Loading assistants…</div>;

  return (
    <div className="dash-stack">
      <div className="panel-head panel-head--row">
        <div>
          <h2>Your AI assistants</h2>
          <p>Each assistant has its own knowledge, instructions and conversations.</p>
        </div>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setCreating((open) => !open)}>
          {creating ? "Cancel" : "New assistant"}
        </button>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      {creating ? (
        <section className="panel panel--form">
          <h3>Create an assistant</h3>
          <p className="panel-note">You can change all of this later.</p>
          <form className="dash-form" onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="assistantName">Assistant name *</label>
                <input id="assistantName" value={form.name} onChange={update("name")} placeholder="SBD Assistant" required />
              </div>
              <div className="field">
                <label htmlFor="tone">How it communicates</label>
                <select id="tone" value={form.tone} onChange={update("tone")}>
                  {TONES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="language">Language</label>
                <input id="language" value={form.language} onChange={update("language")} placeholder="English" />
              </div>
              <div className="field">
                <label htmlFor="greeting">Greeting message</label>
                <input id="greeting" value={form.greeting} onChange={update("greeting")} placeholder="Hi! How can I help you today?" />
              </div>
              <div className="field field--full">
                <label htmlFor="businessDescription">Business description</label>
                <textarea id="businessDescription" rows="3" value={form.businessDescription} onChange={update("businessDescription")} placeholder="What the business does, who it serves." />
              </div>
              <div className="field field--full">
                <label htmlFor="services">Services</label>
                <textarea id="services" rows="3" value={form.services} onChange={update("services")} placeholder="One service per line." />
              </div>
              <div className="field field--full">
                <label htmlFor="products">Products</label>
                <textarea id="products" rows="3" value={form.products} onChange={update("products")} placeholder="Products you sell, with any key details." />
              </div>
              <div className="field field--full">
                <label htmlFor="instructions">Assistant instructions</label>
                <textarea id="instructions" rows="3" value={form.instructions} onChange={update("instructions")} placeholder="Rules it should always follow, e.g. never quote a price without confirming scope." />
              </div>
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create assistant"}
            </button>
          </form>
        </section>
      ) : null}

      {assistants.length ? (
        <div className="assistant-grid">
          {assistants.map((assistant) => (
            <article className="assistant-card" key={assistant.id}>
              <div className="assistant-card-head">
                <span className="assistant-avatar" aria-hidden="true">{assistant.name.charAt(0).toUpperCase()}</span>
                <div>
                  <h3>{assistant.name}</h3>
                  <span className={`badge ${assistant.isActive ? "badge--ok" : ""}`}>
                    {assistant.isActive ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
              <p className="assistant-desc">
                {assistant.businessDescription || "No business description yet."}
              </p>
              <dl className="assistant-meta">
                <div><dt>Training</dt><dd>{assistant.knowledgeCount} items</dd></div>
                <div><dt>Chats</dt><dd>{assistant.conversationCount}</dd></div>
              </dl>
              <button className="btn btn--ghost btn--sm btn--block" type="button" onClick={() => onOpen(assistant.id)}>
                Open workspace
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">No assistants yet. Create your first one to start training it.</div>
      )}
    </div>
  );
}
