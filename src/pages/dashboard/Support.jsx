import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const STATUS_LABEL = { open: "Open", pending: "Awaiting your reply", resolved: "Resolved" };
const CATEGORIES = [
  ["general", "General question"],
  ["billing", "Billing or payments"],
  ["technical", "Technical issue"],
  ["whatsapp", "WhatsApp automation"],
  ["chatbot", "Website chatbot"],
  ["account", "Account access"],
];

const when = (value) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ subject: "", message: "", category: "general", priority: "normal" });
  const [showForm, setShowForm] = useState(false);

  const load = () =>
    api("/support")
      .then((data) => setTickets(data.tickets || []))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const open = async (id) => {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/support/${id}`);
      setThread(data);
      setOpenId(id);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/support", { method: "POST", body: form });
      setForm({ subject: "", message: "", category: "general", priority: "normal" });
      setShowForm(false);
      setNotice("Your request was sent. We reply by email and in this dashboard.");
      await load();
      if (data?.ticket?.id) open(data.ticket.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/support/${openId}/messages`, { method: "POST", body: { message: reply } });
      setReply("");
      await open(openId);
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
        <div className="panel-head panel-head--row">
          <div>
            <h2>Support</h2>
            <p>Send a request and track our replies here. Tickets stay available after they are resolved.</p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { setShowForm((v) => !v); setOpenId(null); setThread(null); }}>
            {showForm ? "Close form" : "New request"}
          </button>
        </div>

        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert">{notice}</div> : null}

        {showForm ? (
          <form className="stack-form" onSubmit={submitTicket}>
            <label>
              Subject
              <input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Short summary of the issue"
                maxLength={160}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
            <label>
              What do you need help with?
              <textarea
                rows={5}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                required
              />
            </label>
            <div className="form-actions">
              <button className="btn btn--primary" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
            </div>
          </form>
        ) : null}
      </section>

      <div className="dash-columns">
        <section className="panel">
          <div className="panel-head">
            <h2>Your tickets</h2>
          </div>
          {tickets.length === 0 ? (
            <p className="empty-note">No tickets yet. Use “New request” when something needs our help.</p>
          ) : (
            <ul className="ticket-list">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={`ticket-row${openId === ticket.id ? " is-active" : ""}`}
                    onClick={() => open(ticket.id)}
                  >
                    <span className={`ticket-status ticket-status--${ticket.status}`}>{STATUS_LABEL[ticket.status] || ticket.status}</span>
                    <strong>{ticket.subject}</strong>
                    <span className="ticket-meta">
                      {ticket.category} · {ticket.messageCount} message{ticket.messageCount === 1 ? "" : "s"} · {when(ticket.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{thread ? thread.ticket.subject : "Conversation"}</h2>
            {thread ? <p>{STATUS_LABEL[thread.ticket.status] || thread.ticket.status} · opened {when(thread.ticket.createdAt)}</p> : null}
          </div>
          {!thread ? (
            <p className="empty-note">Select a ticket to read the conversation and reply.</p>
          ) : (
            <>
              <ol className="ticket-thread">
                {thread.messages.map((message) => (
                  <li key={message.id} className={`ticket-message ticket-message--${message.author}`}>
                    <span className="ticket-message-author">{message.author === "staff" ? "SBD support" : "You"}</span>
                    <p>{message.body}</p>
                    <time>{when(message.createdAt)}</time>
                  </li>
                ))}
              </ol>
              {thread.ticket.status === "resolved" ? (
                <p className="empty-note">This ticket is resolved. Replying will reopen it.</p>
              ) : null}
              <form className="stack-form" onSubmit={sendReply}>
                <label>
                  Reply
                  <textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} required />
                </label>
                <div className="form-actions">
                  <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? "Sending…" : "Send reply"}</button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
