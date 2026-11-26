import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

const KIND_LABEL = { note: "Business info", faq: "FAQ", pricing: "Pricing", document: "Document" };
const TONES = [
  ["friendly", "Friendly and helpful"],
  ["professional", "Professional"],
  ["concise", "Short and concise"],
  ["formal", "Formal"],
];

export default function AssistantWorkspace({ assistantId, onBack, onNavigate }) {
  const [assistant, setAssistant] = useState(null);
  const [items, setItems] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [view, setView] = useState("training");
  const [error, setError] = useState("");

  const loadKnowledge = () =>
    api(`/assistants/${assistantId}/knowledge`).then((data) => setItems(data.items));
  const loadConversations = () =>
    api(`/assistants/${assistantId}/conversations`).then((data) => setConversations(data.conversations));

  useEffect(() => {
    api(`/assistants/${assistantId}`)
      .then((data) => setAssistant(data.assistant))
      .catch((err) => setError(err.message));
    loadKnowledge().catch((err) => setError(err.message));
    loadConversations().catch(() => {});
  }, [assistantId]);

  if (error && !assistant) return <div className="form-alert form-alert--error">{error}</div>;
  if (!assistant) return <div className="dash-loading">Loading assistant…</div>;

  return (
    <div className="dash-stack">
      <div className="workspace-head">
        <button type="button" className="panel-link" onClick={onBack}>← Back</button>
        <div>
          <h2>{assistant.name}</h2>
          <p>{assistant.businessDescription || "No business description yet."}</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {[
          ["training", "AI training"],
          ["test", "Test chat"],
          ["settings", "Assistant settings"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={view === key ? "is-active" : ""}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      {view === "training" ? (
        <Training
          assistantId={assistantId}
          items={items}
          reload={loadKnowledge}
          setError={setError}
          onOpenKnowledge={() => onNavigate({ tab: "knowledge" })}
        />
      ) : null}

      {view === "test" ? (
        <TestChat
          assistant={assistant}
          conversations={conversations}
          reloadConversations={loadConversations}
          setError={setError}
          onEditInstructions={() => setView("settings")}
        />
      ) : null}

      {view === "settings" ? (
        <AssistantSettings
          assistant={assistant}
          setAssistant={setAssistant}
          onDeleted={() => onNavigate({ tab: "assistants" })}
          setError={setError}
        />
      ) : null}
    </div>
  );
}

function Training({ assistantId, items, reload, setError, onOpenKnowledge }) {
  /* The owner writes their own training title; everything is stored as a
     business information note. */
  const [form, setForm] = useState({ kind: "note", title: "", content: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [asking, setAsking] = useState(null);
  const fileRef = useRef(null);
  const documents = items.filter((item) => item.kind === "document").length;

  async function addItem(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/assistants/${assistantId}/knowledge`, { method: "POST", body: form });
      setNotice(data.message);
      setForm({ kind: "note", title: "", content: "" });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPdf(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is larger than the 10 MB limit. Compress the PDF or split it into smaller documents.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const data = await api(`/assistants/${assistantId}/knowledge/pdf`, { method: "POST", formData });
      setNotice(data.message);
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id) {
    try {
      await api(`/assistants/${assistantId}/knowledge/${id}`, { method: "PATCH", body: editForm });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this training item?")) return;
    try {
      await api(`/assistants/${assistantId}/knowledge/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dash-columns">
      <section className="panel panel--form">
        <div className="panel-head">
          <h3>Teach your assistant</h3>
          <p>Everything here is used as source material when it answers.</p>
        </div>

        {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

        <div className="form-alert form-alert--info">
          Products, prices, FAQs and uploaded documents are shared by all your assistants in
          <button className="panel-link" type="button" onClick={onOpenKnowledge}> Knowledge Base</button>.
          Anything you add below is used by this assistant only.
        </div>

        <form className="dash-form" onSubmit={addItem}>
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="kTitle">Title</label>
              <input
                id="kTitle"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Give this training a name, for example Delivery times"
                maxLength={160}
              />
            </div>
            <div className="field field--full">
              <label htmlFor="kContent">Information</label>
              <textarea id="kContent" rows="5" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required placeholder="Write it the way you would explain it to a customer." />
            </div>
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add to training"}
          </button>
        </form>

        <form className="upload-box" onSubmit={uploadPdf}>
          <div>
            <strong>Upload a PDF</strong>
            <p>
              Price lists, service guides and company documents, up to 10 MB. The PDF must contain real text —
              scanned pages or photos of paper have nothing to read.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose a PDF document"
            disabled={busy}
          />
          <button className="btn btn--ghost btn--sm" type="submit" disabled={busy}>
            {busy ? "Reading PDF…" : "Upload PDF"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Training material ({items.length})</h3>
          <p>
            {documents ? `${documents} PDF${documents === 1 ? "" : "s"} saved · ` : ""}
            stored on the platform, so it is still here after a refresh. Your assistant uses all of it when it answers.
          </p>
        </div>
        {items.length ? (
          <ul className="training-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="training-meta">
                  <span className={`badge badge--${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                  <strong>{item.title || item.sourceName || "Untitled"}</strong>
                </div>
                {editing === item.id ? (
                  <div className="training-edit">
                    <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} aria-label="Title" />
                    <textarea rows="6" value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} aria-label="Content" />
                    <div className="training-actions">
                      <button className="btn btn--primary btn--sm" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="training-text">{item.content.slice(0, 260)}{item.content.length > 260 ? "…" : ""}</p>
                    {item.kind === "document" ? (
                      <p className="panel-note">
                        {item.content.length.toLocaleString("en-GB")} characters read from this PDF
                      </p>
                    ) : null}
                    <div className="training-actions">
                      {item.kind === "document" ? (
                        <button
                          className="panel-link"
                          type="button"
                          onClick={() => setAsking(asking === item.id ? null : item.id)}
                        >
                          {asking === item.id ? "Close questions" : "Ask this document"}
                        </button>
                      ) : null}
                      <button className="panel-link" type="button" onClick={() => { setEditing(item.id); setEditForm({ title: item.title, content: item.content }); }}>
                        Edit
                      </button>
                      <button className="panel-link panel-link--danger" type="button" onClick={() => remove(item.id)}>Delete</button>
                    </div>
                    {asking === item.id ? <DocumentQuestions assistantId={assistantId} item={item} /> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No training material yet. Add business information, an FAQ or a PDF.</div>
        )}
      </section>
    </div>
  );
}

/* Ask the assistant about one uploaded document on its own. */
function DocumentQuestions({ assistantId, item }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const data = await api(`/assistants/${assistantId}/knowledge/${item.id}/ask`, {
        method: "POST",
        body: { question: question.trim() },
      });
      setAnswer(data.answer);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="document-qa">
      <strong>Ask about {item.sourceName || item.title || "this document"}</strong>
      <p className="panel-note">Answers come only from this document.</p>
      <form className="chat-form" onSubmit={ask}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. What does the Growth plan cost?"
          aria-label="Question about this document"
          maxLength={600}
        />
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
          {busy ? "Reading…" : "Ask"}
        </button>
      </form>
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {answer ? <div className="document-answer">{answer}</div> : null}
    </div>
  );
}

function TestChat({ assistant, conversations, reloadConversations, setError, onEditInstructions }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(event) {
    event.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setNotice("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setBusy(true);

    try {
      const data = await api(`/assistants/${assistant.id}/chat`, {
        method: "POST",
        body: { message: text, conversationId: conversationId || undefined },
      });
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      await reloadConversations();
    } catch (err) {
      setError("");
      setNotice(err.message);
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(id) {
    try {
      const data = await api(`/conversations/${id}`);
      setConversationId(id);
      setMessages(data.messages.map((m) => ({ role: m.role, content: m.content })));
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <div className="chat-layout">
      <section className="chat-panel">
        <div className="chat-head">
          <div>
            <strong>{assistant.name}</strong>
            <span>Test conversation — only you can see this</span>
          </div>
          <div className="chat-head-actions">
            <button className="panel-link" type="button" onClick={onEditInstructions}>Edit instructions</button>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => { setMessages([]); setConversationId(""); setNotice(""); }}
            >
              New conversation
            </button>
          </div>
        </div>

        <div className="chat-log" ref={logRef}>
          {messages.length === 0 && !busy ? (
            <div className="chat-placeholder">
              <p>{assistant.greeting || `Hi! I'm ${assistant.name}. Ask me anything about the business.`}</p>
              <span>Try asking about services, prices or opening hours.</span>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div key={index} className={`chat-msg chat-msg--${message.role}`}>
              <span className="chat-role">{message.role === "user" ? "You" : assistant.name}</span>
              <p>{message.content}</p>
            </div>
          ))}

          {busy ? (
            <div className="chat-msg chat-msg--assistant" aria-live="polite">
              <span className="chat-role">{assistant.name}</span>
              <p className="typing-dots" aria-label={`${assistant.name} is thinking`}>
                <span /><span /><span />
              </p>
            </div>
          ) : null}
        </div>

        {notice ? <div className="form-alert form-alert--error">{notice}</div> : null}

        <form className="chat-form" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your assistant a question…"
            aria-label="Message"
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>Send</button>
        </form>
      </section>

      <aside className="chat-history">
        <h3>Previous conversations</h3>
        {conversations.length ? (
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button type="button" onClick={() => openConversation(conversation.id)}>
                  <strong>{conversation.title}</strong>
                  <span>{conversation.messageCount} messages</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty empty--sm">No conversations yet.</div>
        )}
      </aside>
    </div>
  );
}

function AssistantSettings({ assistant, setAssistant, onDeleted, setError }) {
  const [form, setForm] = useState({
    name: assistant.name,
    businessDescription: assistant.businessDescription,
    services: assistant.services,
    products: assistant.products,
    tone: assistant.tone,
    language: assistant.language,
    greeting: assistant.greeting,
    instructions: assistant.instructions,
    isActive: assistant.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/assistants/${assistant.id}`, { method: "PATCH", body: form });
      setAssistant(data.assistant);
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${assistant.name}? Its training and conversations will be removed.`)) return;
    try {
      await api(`/assistants/${assistant.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel panel--form">
      <div className="panel-head">
        <h3>Assistant settings</h3>
        <p>Changes apply to the next conversation immediately.</p>
      </div>

      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <form className="dash-form" onSubmit={save}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="asName">Assistant name</label>
            <input id="asName" value={form.name} onChange={update("name")} required />
          </div>
          <div className="field">
            <label htmlFor="asTone">Communication style</label>
            <select id="asTone" value={form.tone} onChange={update("tone")}>
              {TONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="asLanguage">Language</label>
            <input id="asLanguage" value={form.language} onChange={update("language")} />
          </div>
          <div className="field">
            <label htmlFor="asActive">Status</label>
            <select id="asActive" value={String(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Paused</option>
            </select>
          </div>
          <div className="field field--full">
            <label htmlFor="asGreeting">Greeting</label>
            <input id="asGreeting" value={form.greeting} onChange={update("greeting")} />
          </div>
          <div className="field field--full">
            <label htmlFor="asDescription">Business description</label>
            <textarea id="asDescription" rows="3" value={form.businessDescription} onChange={update("businessDescription")} />
          </div>
          <div className="field field--full">
            <label htmlFor="asServices">Services</label>
            <textarea id="asServices" rows="3" value={form.services} onChange={update("services")} />
          </div>
          <div className="field field--full">
            <label htmlFor="asProducts">Products</label>
            <textarea id="asProducts" rows="3" value={form.products} onChange={update("products")} />
          </div>
          <div className="field field--full">
            <label htmlFor="asInstructions">Instructions</label>
            <textarea id="asInstructions" rows="4" value={form.instructions} onChange={update("instructions")} />
          </div>
        </div>
        <div className="dash-actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          <button className="btn btn--ghost btn--danger" type="button" onClick={remove}>Delete assistant</button>
        </div>
      </form>
    </section>
  );
}
