import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import AdminEmail from "./AdminEmail";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const shortDate = (value) => (value ? dateFormat.format(new Date(value)) : "—");

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/admin")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading overview…</div>;

  const stats = [
    { label: "Accounts", value: data.stats.users, note: `${data.stats.verifiedUsers} verified` },
    { label: "New this week", value: data.stats.newUsers },
    { label: "AI assistants", value: data.stats.assistants },
    { label: "Conversations", value: data.stats.conversations },
    { label: "Messages", value: data.stats.messages, note: `${data.stats.messagesThisWeek} this week` },
    { label: "Leads collected", value: data.stats.leads },
    { label: "Payments to verify", value: data.stats.pendingPayments },
    { label: "Training items", value: data.stats.knowledgeItems },
    { label: "Suspended accounts", value: data.stats.suspendedUsers },
  ];

  return (
    <div className="dash-stack">
      <div className="stat-grid admin-stats">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
            {stat.note ? <span className="admin-stat-note">{stat.note}</span> : null}
          </div>
        ))}
      </div>

      <AdminEmail />

      <div className="dash-columns">
        <section className="panel">
          <div className="panel-head">
            <h2>Newest accounts</h2>
          </div>
          {data.recentUsers.length ? (
            <ul className="activity-list">
              {data.recentUsers.map((item) => (
                <li key={item.id}>
                  <strong>{item.fullName}</strong>
                  <span>
                    {item.email} · {item.businessName || "No business"} · joined {shortDate(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No accounts yet.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Latest conversations</h2>
          </div>
          {data.recentConversations.length ? (
            <ul className="activity-list">
              {data.recentConversations.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.userEmail} · {item.assistantName} · {item.messageCount} messages
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No conversations have been started yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
