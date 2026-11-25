import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

export default function Conversations() {
  const [list, setList] = useState(null);
  const [assistants, setAssistants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef(null);

  const load = (filters = {}) => {
    const params = new URLSearchParams();
    const q = filters.query ?? query;
    const s = filters.status ?? status;
    const a = filters.assistantId ?? assistantId;
    if (q.trim()) params.set("q", q.trim());
    if (s) params.set("status", s);
    if (a) params.set("assistantId", a);
    return api(`/conversations${params.toString() ? `?${params}` : ""}`)
      .then((data) => setList(data.conversations))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load({ query: "", status: "", assistantId: "" });
    api("/assistants")
      .then((data) => setAssistants(data.assistants))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [selected]);

  async function open(id) {
    try {
      const data = await api(`/conversations/${id}`);
      setSelected(data);
      setReply("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function patch(body, success) {
    setBusy(true);
    setError("");
    try {
      await api(`/conversations/${selected.conversation.id}`, { method: "PATCH", body });
      await open(selected.conversation.id);
      await load();
      if (success) setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/conversations/${selected.conversation.id}/messages`, {
        method: "POST",
        body: { message: reply.trim() },
      });
      setReply("");
      await open(selected.conversation.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this conversation? The transcript is removed for good.")) return;
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      setList((current) => current.filter((item) => item.id !== id));
      if (selected?.conversation.id === id) setSelected(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !list) return <div className="form-alert form-alert--error">{error}</div>;
  if (!list) return <div className="dash-loading">Loading conversations…</div>;

  const conversation = selected?.conversation;
  const label = (message) =>
    message.author === "team"
      ? "Your team"
      : message.role === "user"
        ? conversation?.channel === "widget"
          ? conversation?.visitor?.name || "Website visitor"
          : "Customer"
        : conversation?.assistantName || "Assistant";

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Conversations</h2>
            <p>Every chat handled by your assistants, from the dashboard and your website.</p>
          </div>
        </div>
        <div className="filters">
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load();
            }}
          >
            <input
              type="search"
              placeholder="Search messages, visitor or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search conversations"
            />
            <button type="submit" className="btn btn--ghost btn--sm">Search</button>
          </form>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              load({ status: event.target.value });
            }}
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            aria-label="Filter by assistant"
            value={assistantId}
            onChange={(event) => {
              setAssistantId(event.target.value);
              load({ assistantId: event.target.value });
            }}
          >
            <option value="">All assistants</option>
            {assistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
            ))}
          </select>
        </div>

        {list.length ? (
          <ul className="conversation-list">
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={conversation?.id === item.id ? "is-active" : ""}
                  onClick={() => open(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {item.channel === "widget" ? "Website" : "Dashboard"} · {item.assistantName} · {item.messageCount} messages
                    {item.visitorEmail ? ` · ${item.visitorEmail}` : ""}
                  </span>
                  <span className="conversation-preview">{item.lastMessage}</span>
                  <span className={`badge ${item.status === "resolved" ? "" : "badge--ok"}`}>
                    {item.status === "resolved" ? "Resolved" : item.takeover ? "You are handling" : "Open"}
                  </span>
                </button>
                <button type="button" className="panel-link panel-link--danger" onClick={() => remove(item.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No conversations match that search yet.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>{conversation ? conversation.title : "Transcript"}</h2>
            <p>
              {conversation
                ? `${conversation.assistantName} · ${conversation.status === "resolved" ? "resolved" : "open"}${
                    conversation.takeover ? " · handled by you" : ""
                  }`
                : "Select a conversation to read it."}
            </p>
          </div>
          {conversation ? (
            <div className="panel-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => patch({ takeover: !conversation.takeover })}
              >
                {conversation.takeover ? "Return to assistant" : "Take over chat"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => patch({ status: conversation.status === "resolved" ? "open" : "resolved" })}
              >
                {conversation.status === "resolved" ? "Reopen" : "Mark resolved"}
              </button>
            </div>
          ) : null}
        </div>

        {selected?.lead ? (
          <div className="lead-strip">
            <strong>Lead</strong>
            <span>{selected.lead.name || "Unnamed"}</span>
            {selected.lead.email ? <span>{selected.lead.email}</span> : null}
            {selected.lead.phone ? <span>{selected.lead.phone}</span> : null}
            {selected.lead.service ? <span>Needs: {selected.lead.service}</span> : null}
          </div>
        ) : null}

        {conversation ? (
          <>
            <div className="transcript" ref={transcriptRef}>
              {selected.messages.map((message) => (
                <div key={message.id} className={`chat-msg chat-msg--${message.author === "team" ? "team" : message.role}`}>
                  <span className="chat-role">{label(message)}</span>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>

            {conversation.takeover ? (
              <form className="chat-form" onSubmit={sendReply}>
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply to the visitor as your team…"
                  aria-label="Reply"
                  maxLength={4000}
                />
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
                  Send reply
                </button>
              </form>
            ) : (
              <p className="panel-note">
                The assistant is answering this conversation. Take it over to reply yourself.
              </p>
            )}
          </>
        ) : (
          <div className="empty">Nothing selected yet.</div>
        )}
      </section>
    </div>
  );
}
