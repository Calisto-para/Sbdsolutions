import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";

const EMPTY_BUSINESS = {
  name: "",
  description: "",
  industry: "",
  website: "",
  supportEmail: "",
  phone: "",
  whatsapp: "",
  address: "",
  openingHours: "",
  socialLinks: "",
  additionalInstructions: "",
  paymentMethods: "",
  deliveryInfo: "",
};

const EMPTY_OFFERING = { type: "product", name: "", description: "", price: "", options: "" };
const EMPTY_FAQ = { question: "", answer: "" };

const TABS = [
  ["business", "Business information"],
  ["offerings", "Products & services"],
  ["faqs", "FAQs"],
  ["documents", "Documents"],
  ["test", "Test your AI"],
];

export default function KnowledgeBase() {
  const [data, setData] = useState(null);
  const [assistants, setAssistants] = useState([]);
  const [tab, setTab] = useState("business");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api("/knowledge")
      .then((payload) => setData(payload))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    api("/assistants")
      .then((payload) => setAssistants(payload.assistants || []))
      .catch(() => {});
  }, []);

  if (!data) {
    return error ? (
      <div className="form-alert form-alert--error">{error}</div>
    ) : (
      <div className="dash-loading">Loading your knowledge base…</div>
    );
  }

  const stats = data.stats || {};

  return (
    <div className="dash-stack">
      <div className="panel-head panel-head--row">
        <div>
          <h2>Train your AI</h2>
          <p>
            Everything saved here is what your assistant answers from — business details, products, prices,
            FAQs and uploaded documents. It is private to your account and used immediately, even in chats
            already in progress.
          </p>
        </div>
        <div className="kb-stats">
          <span><strong>{stats.offerings || 0}</strong> products &amp; services</span>
          <span><strong>{stats.faqs || 0}</strong> FAQs</span>
          <span><strong>{stats.documents || 0}</strong> documents</span>
        </div>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "is-active" : ""}
            onClick={() => {
              setTab(key);
              setNotice("");
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "business" ? (
        <BusinessInformation
          business={data.business}
          setData={setData}
          setError={setError}
          setNotice={setNotice}
          onPreview={() => setTab("test")}
        />
      ) : null}

      {tab === "offerings" ? (
        <Offerings
          offerings={data.offerings}
          reload={load}
          setError={setError}
          setNotice={setNotice}
        />
      ) : null}

      {tab === "faqs" ? (
        <Faqs faqs={data.faqs} reload={load} setError={setError} setNotice={setNotice} />
      ) : null}

      {tab === "documents" ? (
        <Documents documents={data.documents} reload={load} setError={setError} setNotice={setNotice} />
      ) : null}

      {tab === "test" ? (
        <TestAi assistants={assistants} setError={setError} setNotice={setNotice} />
      ) : null}
    </div>
  );
}

function BusinessInformation({ business, setData, setError, setNotice, onPreview }) {
  const [form, setForm] = useState({ ...EMPTY_BUSINESS, ...(business || {}) });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setForm({ ...EMPTY_BUSINESS, ...(business || {}) });
  }, [business?.updatedAt]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const payload = await api("/knowledge/business", { method: "PUT", body: form });
      setData((current) => ({ ...current, business: payload.business }));
      setNotice(payload.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    setBusy("publish");
    setError("");
    setNotice("");
    try {
      const payload = await api("/knowledge/publish", { method: "POST", body: form });
      setData((current) => ({ ...current, business: payload.business }));
      setNotice(payload.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const field = (key, label, placeholder, options = {}) => (
    <div className={`field${options.full ? " field--full" : ""}`}>
      <label htmlFor={`kb-${key}`}>{label}</label>
      {options.area ? (
        <textarea
          id={`kb-${key}`}
          rows={options.rows || 3}
          value={form[key]}
          onChange={update(key)}
          placeholder={placeholder}
          maxLength={options.max}
        />
      ) : (
        <input
          id={`kb-${key}`}
          value={form[key]}
          onChange={update(key)}
          placeholder={placeholder}
          maxLength={options.max}
          type={options.type || "text"}
        />
      )}
      {options.hint ? <span className="field-hint">{options.hint}</span> : null}
    </div>
  );

  return (
    <form className="panel panel--form" onSubmit={save}>
      <div className="panel-head">
        <h3>Business information</h3>
        <p>Optional fields can stay empty. The assistant only uses what you save, and never invents the rest.</p>
      </div>

      <div className="form-grid">
        {field("name", "Business name", "SBD AI Solutions", { max: 160 })}
        {field("industry", "Industry or category", "Technology", { max: 120 })}
        {field("website", "Website", "https://example.com", { type: "url" })}
        {field("supportEmail", "Business email", "hello@example.com", { type: "email" })}
        {field("phone", "Business phone", "+234 000 000 0000", { max: 40 })}
        {field("whatsapp", "WhatsApp number", "+234 000 000 0000", { max: 40 })}
        {field("address", "Address or service location", "City, country — or 'online only'", { max: 400 })}
        {field("openingHours", "Opening hours", "Mon–Fri 9:00–17:00, Sat 10:00–14:00", { max: 600 })}
        {field("socialLinks", "Social media links", "Instagram: @yourbrand · X: @yourbrand", { max: 600 })}
        {field("paymentMethods", "Payment methods", "Card, bank transfer, cash on delivery", { max: 600 })}
        {field("deliveryInfo", "Delivery information", "Nationwide in 2–5 working days; free over $50", { max: 800 })}
        {field("description", "What the business does", "Describe your business in a few sentences.", { area: true, full: true, rows: 4, max: 3000 })}
        {field(
          "additionalInstructions",
          "Additional business instructions",
          "Anything the assistant should always remember: tone, policies, what to avoid saying.",
          { area: true, full: true, rows: 4, max: 4000 }
        )}
      </div>

      <div className="dash-actions">
        <button className="btn btn--primary" type="submit" disabled={Boolean(busy)}>
          {busy === "save" ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onPreview} disabled={Boolean(busy)}>
          Preview AI assistant
        </button>
        <button className="btn btn--ghost" type="button" onClick={publish} disabled={Boolean(busy)}>
          {busy === "publish" ? "Publishing…" : "Publish changes"}
        </button>
      </div>
      <p className="panel-note">
        {business?.publishedAt
          ? `Last published ${new Date(business.publishedAt).toLocaleString()}. Saved changes are always used by the next reply.`
          : "Publishing records that you have reviewed these details. Saved changes are already used by the next reply."}
      </p>
    </form>
  );
}

function Offerings({ offerings, reload, setError, setNotice }) {
  const [form, setForm] = useState(EMPTY_OFFERING);
  const [editing, setEditing] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_OFFERING);
  const [busy, setBusy] = useState(false);

  const update = (setter, key) => (event) => setter((current) => ({ ...current, [key]: event.target.value }));

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = await api("/knowledge/offerings", { method: "POST", body: form });
      setForm(EMPTY_OFFERING);
      setNotice(`${payload.offering.name} added.`);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id) {
    setBusy(true);
    setError("");
    try {
      await api(`/knowledge/offerings/${id}`, { method: "PATCH", body: editForm });
      setEditing("");
      setNotice("Updated.");
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this product or service?")) return;
    try {
      await api(`/knowledge/offerings/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const fields = (state, setter) => (
    <div className="form-grid">
      <div className="field">
        <label>Type</label>
        <select value={state.type} onChange={update(setter, "type")}>
          <option value="product">Product</option>
          <option value="service">Service</option>
        </select>
      </div>
      <div className="field">
        <label>Name</label>
        <input value={state.name} onChange={update(setter, "name")} maxLength={160} required placeholder="Gold plan" />
      </div>
      <div className="field">
        <label>Price</label>
        <input value={state.price} onChange={update(setter, "price")} maxLength={120} placeholder="$49 / month" />
      </div>
      <div className="field">
        <label>Options or packages</label>
        <input value={state.options} onChange={update(setter, "options")} maxLength={1200} placeholder="Monthly, quarterly, annual" />
      </div>
      <div className="field field--full">
        <label>Description</label>
        <textarea rows={2} value={state.description} onChange={update(setter, "description")} maxLength={2000} placeholder="What is included." />
      </div>
    </div>
  );

  return (
    <div className="dash-columns">
      <section className="panel panel--form">
        <div className="panel-head">
          <h3>Add a product or service</h3>
          <p>Leave the price empty when there is no fixed price — the assistant will offer an enquiry instead of guessing.</p>
        </div>
        <form className="dash-form" onSubmit={add}>
          {fields(form, setForm)}
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add product or service"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Products and services ({offerings.length})</h3>
          <p>These prices are shown to the assistant exactly as you type them.</p>
        </div>
        {offerings.length ? (
          <ul className="training-list">
            {offerings.map((item) => (
              <li key={item.id}>
                <div className="training-meta">
                  <span className={`badge badge--${item.type}`}>{item.type === "service" ? "Service" : "Product"}</span>
                  <strong>{item.name}</strong>
                  {item.price ? <span className="kb-price">{item.price}</span> : null}
                </div>
                {editing === item.id ? (
                  <div className="training-edit">
                    {fields(editForm, setEditForm)}
                    <div className="training-actions">
                      <button className="btn btn--primary btn--sm" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing("")}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {item.description ? <p className="training-text">{item.description}</p> : null}
                    {item.options ? <p className="panel-note">Options: {item.options}</p> : null}
                    <div className="training-actions">
                      <button
                        className="panel-link"
                        type="button"
                        onClick={() => {
                          setEditing(item.id);
                          setEditForm({
                            type: item.type,
                            name: item.name,
                            description: item.description,
                            price: item.price,
                            options: item.options,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button className="panel-link panel-link--danger" type="button" onClick={() => remove(item.id)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No products or services yet.</div>
        )}
      </section>
    </div>
  );
}

function Faqs({ faqs, reload, setError, setNotice }) {
  const [form, setForm] = useState(EMPTY_FAQ);
  const [editing, setEditing] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_FAQ);
  const [busy, setBusy] = useState(false);

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/knowledge/faqs", { method: "POST", body: form });
      setForm(EMPTY_FAQ);
      setNotice("FAQ added.");
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id) {
    setBusy(true);
    setError("");
    try {
      await api(`/knowledge/faqs/${id}`, { method: "PATCH", body: editForm });
      setEditing("");
      setNotice("FAQ updated.");
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this FAQ?")) return;
    try {
      await api(`/knowledge/faqs/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dash-columns">
      <section className="panel panel--form">
        <div className="panel-head">
          <h3>Add an FAQ</h3>
          <p>The assistant answers these questions exactly as you write them.</p>
        </div>
        <form className="dash-form" onSubmit={add}>
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="faqQuestion">Question</label>
              <input
                id="faqQuestion"
                value={form.question}
                onChange={(event) => setForm({ ...form, question: event.target.value })}
                maxLength={400}
                required
                placeholder="Do you deliver outside Lagos?"
              />
            </div>
            <div className="field field--full">
              <label htmlFor="faqAnswer">Answer</label>
              <textarea
                id="faqAnswer"
                rows={4}
                value={form.answer}
                onChange={(event) => setForm({ ...form, answer: event.target.value })}
                maxLength={6000}
                required
                placeholder="Yes — nationwide delivery in 2–5 working days."
              />
            </div>
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add FAQ"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Your FAQs ({faqs.length})</h3>
          <p>Add as many as you need.</p>
        </div>
        {faqs.length ? (
          <ul className="training-list">
            {faqs.map((item) => (
              <li key={item.id}>
                <div className="training-meta">
                  <span className="badge badge--faq">FAQ</span>
                  <strong>{item.question}</strong>
                </div>
                {editing === item.id ? (
                  <div className="training-edit">
                    <input value={editForm.question} onChange={(event) => setEditForm({ ...editForm, question: event.target.value })} aria-label="Question" />
                    <textarea rows={4} value={editForm.answer} onChange={(event) => setEditForm({ ...editForm, answer: event.target.value })} aria-label="Answer" />
                    <div className="training-actions">
                      <button className="btn btn--primary btn--sm" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing("")}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="training-text">{item.answer}</p>
                    <div className="training-actions">
                      <button
                        className="panel-link"
                        type="button"
                        onClick={() => {
                          setEditing(item.id);
                          setEditForm({ question: item.question, answer: item.answer });
                        }}
                      >
                        Edit
                      </button>
                      <button className="panel-link panel-link--danger" type="button" onClick={() => remove(item.id)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No FAQs yet.</div>
        )}
      </section>
    </div>
  );
}

function Documents({ documents, reload, setError, setNotice }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState("");
  const [viewText, setViewText] = useState("");
  const fileRef = useRef(null);

  async function upload(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF, DOCX or TXT file first.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is larger than the 10 MB limit. Split it into smaller documents.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    try {
      const payload = await api("/knowledge/documents", { method: "POST", formData });
      setNotice(payload.message);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function view(id) {
    if (viewing === id) {
      setViewing("");
      setViewText("");
      return;
    }
    try {
      const payload = await api(`/knowledge/documents/${id}`);
      setViewing(id);
      setViewText(payload.document.text || "");
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this document? The assistant will stop using it.")) return;
    try {
      await api(`/knowledge/documents/${id}`, { method: "DELETE" });
      if (viewing === id) {
        setViewing("");
        setViewText("");
      }
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dash-stack">
      <section className="panel panel--form">
        <div className="panel-head">
          <h3>Upload a business document</h3>
          <p>
            PDF, DOCX or TXT up to 10 MB. The text is extracted and saved to your knowledge base, so you can
            read exactly what your assistant can see. Scanned PDFs without a text layer cannot be read.
          </p>
        </div>
        <form className="upload-box" onSubmit={upload}>
          <div className="field">
            <label htmlFor="docTitle">Document title (optional)</label>
            <input
              id="docTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="Price list 2026"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aria-label="Choose a document"
            disabled={busy}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? "Reading document…" : "Upload document"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Documents ({documents.length})</h3>
          <p>
            Your assistant searches these documents for every question, using only the passages that match.
            Up to 10 MB per file and 200,000 characters of text are kept per document (about 300 pages).
          </p>
        </div>
        {documents.length ? (
          <ul className="training-list">
            {documents.map((item) => (
              <li key={item.id}>
                <div className="training-meta">
                  <span className="badge badge--document">Document</span>
                  <strong>{item.name}</strong>
                </div>
                <p className="panel-note">
                  {item.characters.toLocaleString("en-GB")} characters read
                  {item.sizeBytes ? ` · ${(item.sizeBytes / 1024).toFixed(0)} KB` : ""}
                </p>
                <div className="training-actions">
                  <button className="panel-link" type="button" onClick={() => view(item.id)}>
                    {viewing === item.id ? "Hide text" : "View extracted text"}
                  </button>
                  <button className="panel-link panel-link--danger" type="button" onClick={() => remove(item.id)}>Delete</button>
                </div>
                {viewing === item.id ? <pre className="kb-document-text">{viewText}</pre> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No documents uploaded yet.</div>
        )}
      </section>
    </div>
  );
}

function TestAi({ assistants, setError, setNotice }) {
  const [assistantId, setAssistantId] = useState(assistants[0]?.id || "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!assistantId && assistants.length) setAssistantId(assistants[0].id);
  }, [assistants, assistantId]);

  const chosen = useMemo(() => assistants.find((item) => item.id === assistantId) || null, [assistants, assistantId]);

  async function ask(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setAnswer(null);
    try {
      const payload = await api("/knowledge/test", {
        method: "POST",
        body: { question: question.trim(), assistantId: assistantId || undefined },
      });
      setAnswer(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!assistants.length) {
    return (
      <div className="empty">
        Create an AI assistant first, then come back here to test it against your saved business information.
      </div>
    );
  }

  return (
    <section className="panel panel--form">
      <div className="panel-head">
        <h3>Test your AI</h3>
        <p>
          Ask a question the way a customer would. The answer shows which of your saved sources it came from,
          so you can edit the information and test again before publishing.
        </p>
      </div>

      {assistants.length > 1 ? (
        <div className="field">
          <label htmlFor="testAssistant">Assistant</label>
          <select id="testAssistant" value={assistantId} onChange={(event) => setAssistantId(event.target.value)}>
            {assistants.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="panel-note">Testing {chosen?.name || "your assistant"} — you are the only person who sees this.</p>
      )}

      <form className="chat-form" onSubmit={ask}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. How much is the Gold plan and do you deliver to Abuja?"
          aria-label="Test question"
          maxLength={600}
        />
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>

      {answer ? (
        <div className="kb-answer">
          <div className={`kb-grounded ${answer.grounded ? "is-grounded" : "is-empty"}`}>
            {answer.grounded ? "Answered from your saved information" : "No saved information matched this question"}
          </div>
          <p>{answer.answer}</p>
          {answer.sources?.length ? (
            <div className="kb-sources">
              {answer.sources.map((source) => (
                <span key={source} className="kb-source">{source}</span>
              ))}
            </div>
          ) : null}
          <p className="panel-note">{answer.note}</p>
        </div>
      ) : null}
    </section>
  );
}
