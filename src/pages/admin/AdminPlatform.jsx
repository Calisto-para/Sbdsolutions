import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { shortDate } from "./AdminOverview";

const number = (value) => new Intl.NumberFormat("en-GB").format(value || 0);

/* Businesses, assistants and activity across the whole platform. */
export default function AdminPlatform() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = (search = "") => {
    setError("");
    Promise.all([
      api(`/admin/platform`),
      api(`/admin/businesses?q=${encodeURIComponent(search)}`),
      api(`/admin/assistants?q=${encodeURIComponent(search)}`),
    ])
      .then(([platform, businesses, assistants]) => {
        setData({ ...platform, businesses, assistants });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error && !data) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading platform activity…</div>;

  const stats = [
    { label: "Messages this week", value: number(data.activity.messagesThisWeek) },
    { label: "Conversations this week", value: number(data.activity.conversationsThisWeek) },
    { label: "New leads this week", value: number(data.activity.leadsThisWeek) },
    { label: "Leads collected", value: number(data.activity.leads) },
    { label: "Active assistants", value: number(data.activity.activeAssistants) },
    { label: "Suspended accounts", value: number(data.activity.suspendedUsers) },
  ];

  return (
    <div className="dash-stack">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      <div className="stat-grid admin-stats">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Businesses and assistants</h2>
            <p>Every customer business, with the assistants working for it.</p>
          </div>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load(query);
            }}
          >
            <input
              type="search"
              placeholder="Business, owner or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search businesses"
            />
            <button type="submit" className="btn btn--ghost btn--sm">Search</button>
          </form>
        </div>

        {data.businesses.businesses.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Assistants</th>
                  <th>Conversations</th>
                  <th>Leads</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.businesses.businesses.map((business) => (
                  <tr key={business.userId}>
                    <td>
                      <strong>{business.name || "No profile yet"}</strong>
                      <span>{business.industry || business.website || "—"}</span>
                    </td>
                    <td>
                      <strong>{business.owner}</strong>
                      <span>{business.email}</span>
                    </td>
                    <td>{business.assistants}</td>
                    <td>{business.conversations}</td>
                    <td>{business.leads}</td>
                    <td>
                      <span className={`admin-pill${business.suspended ? " admin-pill--muted" : ""}`}>
                        {business.suspended ? "Suspended" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No businesses match that search.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>All AI assistants</h2>
          <p>Every assistant on the platform and how much it is used.</p>
        </div>
        {data.assistants.assistants.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Assistant</th>
                  <th>Owner</th>
                  <th>Conversations</th>
                  <th>Messages</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.assistants.assistants.map((assistant) => (
                  <tr key={assistant.id}>
                    <td><strong>{assistant.name}</strong></td>
                    <td>
                      <strong>{assistant.owner}</strong>
                      <span>{assistant.email}</span>
                    </td>
                    <td>{assistant.conversations}</td>
                    <td>{assistant.messages}</td>
                    <td>
                      <span className={`admin-pill${assistant.active ? "" : " admin-pill--muted"}`}>
                        {assistant.active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td>{shortDate(assistant.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No assistants yet.</div>
        )}
      </section>

      <div className="dash-columns">
        <section className="panel">
          <div className="panel-head">
            <h2>Activity, last 7 days</h2>
          </div>
          <ul className="activity-list">
            {data.daily.map((day) => (
              <li key={day.day}>
                <strong>{shortDate(day.day)}</strong>
                <span>{day.messages} messages · {day.leads} leads</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Most active customers</h2>
          </div>
          {data.busiest.length ? (
            <ul className="activity-list">
              {data.busiest.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.email} · {item.messages} messages</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No customer activity yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
