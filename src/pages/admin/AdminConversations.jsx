import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { shortDate } from "./AdminOverview";

export default function AdminConversations() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  const load = (search = "") => {
    setError("");
    api(`/admin/conversations?q=${encodeURIComponent(search)}`)
      .then((data) => setRows(data.conversations))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <h2>Conversations</h2>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load(query);
            }}
          >
            <input
              type="search"
              placeholder="Customer, assistant or title"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search conversations"
            />
            <button type="submit" className="btn btn--ghost btn--sm">
              Search
            </button>
          </form>
        </div>

        {!rows ? (
          <div className="dash-loading">Loading conversations…</div>
        ) : rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Customer</th>
                  <th>Assistant</th>
                  <th>Messages</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                    </td>
                    <td>
                      <strong>{row.userName}</strong>
                      <span>{row.userEmail}</span>
                    </td>
                    <td>{row.assistantName}</td>
                    <td>{row.messageCount}</td>
                    <td>{shortDate(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No conversations match that search.</div>
        )}
      </section>
    </div>
  );
}
