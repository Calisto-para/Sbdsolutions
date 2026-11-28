import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const STATUSES = ["", "open", "pending", "resolved"];
const LABEL = { open: "Open", pending: "Awaiting customer", resolved: "Resolved" };
const when = (value) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await api(`/admin/support?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`);
      setTickets(data.tickets || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const open = async (id) => {
    setBusy(true);
    setError("");
    try {
      setThread(await api(`/admin/support/${id}`));
      setReply("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (!reply.trim() || !thread) return;
    setBusy(true);
    try {
      await api(`/admin/support/${thread.ticket.id}/messages`, { method: "POST", body: { message: reply } });
      const id = thread.ticket.id;
      setReply("");
      await open(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setTicket = async (patch) => {
    if (!thread) return;
    setBusy(true);
    try {
      await api(`/admin/support/${thread.ticket.id}`, { method: "PATCH", body: patch });
      await open(thread.ticket.id);
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
            <h2>Support tickets</h2>
            <p>Tickets raised by customers. Replies notify the customer by email and in their dashboard.</p>
          </div>
          <div className="admin-filters">
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              {STATUSES.map((value) => (
                <option key={value || "all"} value={value}>{value ? LABEL[value] : "All statuses"}</option>
              ))}
            </select>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") load(); }}
              placeholder="Search subject, name or email"
              aria-label="Search tickets"
            />
            <button type="button" className="btn btn--outline btn--sm" onClick={load}>Search</button>
          </div>
        </div>
        {error ? <div className="form-alert form-alert--error">{error}</div> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr><td colSpan={5}>No tickets match this filter.</td></tr>
              ) : tickets.map((ticket) => (
                <tr key={ticket.id} onClick={() => open(ticket.id)} className="is-clickable">
                  <td>{ticket.subject}</td>
                  <td>{ticket.customer.name}<small>{ticket.customer.email}</small></td>
                  <td><span className={`ticket-status ticket-status--${ticket.status}`}>{LABEL[ticket.status] || ticket.status}</span></td>
                  <td>{ticket.priority}</td>
                  <td>{when(ticket.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {thread ? (
        <section className="panel">
          <div className="panel-head panel-head--row">
            <div>
              <h2>{thread.ticket.subject}</h2>
              <p>{thread.ticket.customer.name} · {thread.ticket.customer.email} · {thread.ticket.category} · opened {when(thread.ticket.createdAt)}</p>
            </div>
            <div className="admin-filters">
              <select value={thread.ticket.status} onChange={(event) => setTicket({ status: event.target.value })} aria-label="Set status">
                {["open", "pending", "resolved"].map((value) => (
                  <option key={value} value={value}>{LABEL[value]}</option>
                ))}
              </select>
              <select value={thread.ticket.priority} onChange={(event) => setTicket({ priority: event.target.value })} aria-label="Set priority">
                {["low", "normal", "high", "urgent"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>

          <ol className="ticket-thread">
            {thread.messages.map((message) => (
              <li key={message.id} className={`ticket-message ticket-message--${message.author}`}>
                <span className="ticket-message-author">{message.author === "staff" ? "SBD support" : message.author === "customer" ? thread.ticket.customer.name : "System"}</span>
                <p>{message.body}</p>
                <time>{when(message.createdAt)}</time>
              </li>
            ))}
          </ol>

          <form className="stack-form" onSubmit={send}>
            <label>
              Reply to the customer
              <textarea rows={4} value={reply} onChange={(event) => setReply(event.target.value)} required />
            </label>
            <div className="form-actions">
              <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? "Sending…" : "Send reply"}</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
