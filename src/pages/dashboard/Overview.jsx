import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const KIND_LABEL = { note: "Business info", faq: "FAQ", pricing: "Pricing", document: "Document" };

export default function Overview({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/overview")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading overview…</div>;

  const stats = [
    { label: "AI assistants", value: data.stats.assistants },
    { label: "Training items", value: data.stats.knowledgeItems },
    { label: "Conversations", value: data.stats.conversations },
    { label: "Messages handled", value: data.stats.messages },
  ];

  return (
    <div className="dash-stack">
      <div className="stat-grid">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="dash-columns">
        <section className="panel">
          <div className="panel-head">
            <h2>Recent conversations</h2>
            <button type="button" className="panel-link" onClick={() => onNavigate({ tab: "conversations" })}>
              View all
            </button>
          </div>
          {data.recentConversations.length ? (
            <ul className="activity-list">
              {data.recentConversations.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.assistantName} · {item.messageCount} messages
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              No conversations yet. Create an assistant, then test it from My AI Assistants.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Recently added training</h2>
            <button type="button" className="panel-link" onClick={() => onNavigate({ tab: "assistants" })}>
              Manage
            </button>
          </div>
          {data.recentKnowledge.length ? (
            <ul className="activity-list">
              {data.recentKnowledge.map((item) => (
                <li key={item.id}>
                  <strong>{item.title || "Untitled"}</strong>
                  <span>
                    {KIND_LABEL[item.kind] || item.kind} · {item.assistantName}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Nothing added yet. Training is what makes your assistant accurate.</div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Quick actions</h2>
        </div>
        <div className="quick-actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onNavigate({ tab: "assistants" })}>
            Create an AI assistant
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onNavigate({ tab: "business" })}>
            Complete business profile
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onNavigate({ tab: "conversations" })}>
            Review conversations
          </button>
        </div>
      </section>
    </div>
  );
}
