import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

const DEFAULT_COLOR = "#0b5cff";

export default function Chatbot() {
  const [assistants, setAssistants] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ name: "", welcomeMessage: "", widgetColor: DEFAULT_COLOR, widgetPosition: "right" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api("/assistants")
      .then((data) => {
        setAssistants(data.assistants);
        if (!selectedId && data.assistants.length) setSelectedId(data.assistants[0].id);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const assistant = useMemo(
    () => (assistants || []).find((item) => item.id === selectedId) || null,
    [assistants, selectedId]
  );

  useEffect(() => {
    if (!assistant) return;
    setForm({
      name: assistant.name,
      welcomeMessage: assistant.welcomeMessage || assistant.greeting || "",
      widgetColor: assistant.widgetColor || DEFAULT_COLOR,
      widgetPosition: assistant.widgetPosition || "right",
    });
    setNotice("");
    setError("");
  }, [assistant?.id]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/assistants/${assistant.id}`, { method: "PATCH", body: form });
      setNotice("Chatbot settings saved. Your website picks them up immediately.");
      setAssistants((current) => current.map((item) => (item.id === data.assistant.id ? { ...item, ...data.assistant } : item)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey() {
    if (!window.confirm("Generate a new installation code? The code currently on your website stops working.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/assistants/${assistant.id}/widget-key`, { method: "POST" });
      setAssistants((current) =>
        current.map((item) => (item.id === data.assistant.id ? { ...item, publicKey: data.assistant.publicKey } : item))
      );
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const snippet = assistant
    ? `<script src="${window.location.origin}/widget.js" data-assistant="${assistant.publicKey}" async></script>`
    : "";

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copy the code from the box below — this browser blocked clipboard access.");
    }
  }

  if (error && !assistants) return <div className="form-alert form-alert--error">{error}</div>;
  if (!assistants) return <div className="dash-loading">Loading your chatbot…</div>;
  if (!assistants.length) {
    return (
      <div className="empty">
        Create an AI assistant first — the chatbot is that assistant, embedded on your website.
      </div>
    );
  }

  const color = form.widgetColor || DEFAULT_COLOR;

  return (
    <div className="dash-stack">
      <div className="panel-head panel-head--row">
        <div>
          <h2>Website chatbot</h2>
          <p>Name it, style it, then paste one line of code into your website.</p>
        </div>
        {assistants.length > 1 ? (
          <div className="field field--inline">
            <label htmlFor="chatbotPick">Assistant</label>
            <select id="chatbotPick" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {assistants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <div className="dash-columns dash-columns--chatbot">
        <section className="panel panel--form">
          <h3>Customise</h3>
          <p className="panel-note">These settings change how the chat looks on your website.</p>
          <form className="dash-form" onSubmit={save}>
            <div className="form-grid">
              <div className="field field--full">
                <label htmlFor="chatbotName">Chatbot name</label>
                <input id="chatbotName" value={form.name} onChange={update("name")} maxLength={120} required />
              </div>
              <div className="field field--full">
                <label htmlFor="chatbotWelcome">Welcome message</label>
                <textarea
                  id="chatbotWelcome"
                  rows="3"
                  maxLength={600}
                  value={form.welcomeMessage}
                  onChange={update("welcomeMessage")}
                  placeholder="Hi! I'm here to help with anything about our services."
                />
              </div>
              <div className="field">
                <label htmlFor="chatbotColor">Brand colour</label>
                <div className="color-field">
                  <input
                    id="chatbotColor"
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR}
                    onChange={update("widgetColor")}
                  />
                  <input
                    aria-label="Brand colour hex value"
                    value={form.widgetColor}
                    onChange={update("widgetColor")}
                    pattern="^#[0-9a-fA-F]{6}$"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="chatbotPosition">Bubble position</label>
                <select id="chatbotPosition" value={form.widgetPosition} onChange={update("widgetPosition")}>
                  <option value="right">Bottom right</option>
                  <option value="left">Bottom left</option>
                </select>
              </div>
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save chatbot settings"}
            </button>
          </form>
        </section>

        <section className="panel">
          <h3>Preview</h3>
          <p className="panel-note">How the chat appears on your website.</p>
          <div className="chat-preview">
            <div className="chat-preview-bar" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="chat-preview-body">
              <div className="chat-preview-panel">
                <div className="chat-preview-head" style={{ background: color, color: "#fff" }}>
                  <strong>{form.name || "Your assistant"}</strong>
                  <span>Ask us anything</span>
                </div>
                <div className="chat-preview-log">
                  <p className="chat-preview-msg" style={{ borderColor: color }}>
                    {form.welcomeMessage || "Hi! How can I help you today?"}
                  </p>
                </div>
                <div className="chat-preview-input" aria-hidden="true">
                  <span>Type your message…</span>
                  <span className="chat-preview-send" style={{ background: color }}>Send</span>
                </div>
              </div>
              <span
                className={`chat-preview-bubble${form.widgetPosition === "left" ? " is-left" : ""}`}
                style={{ background: color }}
                aria-hidden="true"
              >
                💬
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Installation code</h2>
            <p>Paste this before the closing &lt;/body&gt; tag of every page, or in your site builder's custom-code area.</p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={copySnippet}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre className="code-block"><code>{snippet}</code></pre>
        <ol className="install-steps">
          <li>Copy the line above.</li>
          <li>Open your website editor (WordPress, Shopify, Wix, Squarespace, custom HTML).</li>
          <li>Paste it into the footer / custom code section and publish.</li>
          <li>Open your website and click the chat bubble to check it works.</li>
        </ol>
        <div className="panel-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={rotateKey} disabled={busy}>
            Generate a new installation code
          </button>
          <span className="panel-note">
            {assistant?.isActive ? "Chat is live." : "Chat is paused — activate the assistant to take messages."}
          </span>
        </div>
      </section>
    </div>
  );
}
