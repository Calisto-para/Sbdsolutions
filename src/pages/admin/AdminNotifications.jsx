import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const when = (value) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default function AdminNotifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/admin/notifications")
      .then((data) => {
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    setBusy(true);
    try {
      await api("/admin/notifications/read", { method: "POST", body: { keys: items.filter((i) => !i.read).map((i) => i.key) } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (key) => {
    try {
      await api("/admin/notifications/read", { method: "POST", body: { keys: [key] } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const types = ["all", ...new Set(items.map((item) => item.type))];
  const shown = filter === "all" ? items : items.filter((item) => item.type === filter);

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Notifications</h2>
            <p>{unread} unread. Generated from real activity: registrations, payments, enquiries and support tickets.</p>
          </div>
          <div className="admin-filters">
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter notifications">
              {types.map((type) => (
                <option key={type} value={type}>{type === "all" ? "All types" : type.replace(/_/g, " ")}</option>
              ))}
            </select>
            <button type="button" className="btn btn--outline btn--sm" onClick={markAll} disabled={busy || unread === 0}>
              Mark all read
            </button>
          </div>
        </div>
        {error ? <div className="form-alert form-alert--error">{error}</div> : null}

        {shown.length === 0 ? (
          <p className="empty-note">Nothing here yet.</p>
        ) : (
          <ul className="ticket-list">
            {shown.map((item) => (
              <li key={item.key}>
                <div className={`ticket-row${item.read ? "" : " is-unread"}`}>
                  <span className="ticket-meta">{item.type.replace(/_/g, " ")} · {when(item.createdAt)}</span>
                  <strong>{item.title}</strong>
                  <span className="ticket-meta">{item.detail}</span>
                  <div className="notification-actions">
                    <a className="hm-link" href={item.href}>Open</a>
                    {!item.read ? (
                      <button type="button" className="panel-link" onClick={() => markOne(item.key)}>Mark read</button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
