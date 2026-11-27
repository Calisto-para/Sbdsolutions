import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const KIND_LABEL = { note: "Business info", faq: "FAQ", pricing: "Pricing", document: "Document" };

const percent = (used, limit) => Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

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

  const limits = data.limits || {};
  const stats = [
    { label: "AI agents", value: data.stats.assistants },
    { label: "Training items", value: data.stats.knowledgeItems },
    { label: "Conversations", value: data.stats.conversations },
    { label: "Messages handled", value: data.stats.messages },
  ];

  const agentPercent = percent(limits.used ?? data.stats.assistants, limits.limit ?? 1);
  const customerPercent = percent(limits.customers ?? 0, limits.customerLimit ?? 50);
  const creditPercent = limits.creditLimit ? Math.min(100, Math.round((limits.creditsUsed / limits.creditLimit) * 100)) : 0;
  const atAgentLimit = limits.canCreate === false;
  const creditsExhausted = Boolean(limits.creditsExhausted);
  const creditsLow = !creditsExhausted && creditPercent >= 80;
  const formatCredits = (value) => Number(value || 0).toLocaleString("en-GB", { maximumFractionDigits: 1 });

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Plan usage</h2>
            <p>
              {limits.planName || "Your"} plan ·{" "}
              {limits.remaining ?? 0} agent {(limits.remaining ?? 0) === 1 ? "slot" : "slots"} remaining
            </p>
          </div>
          <button type="button" className="panel-link" onClick={() => onNavigate({ tab: "subscriptions" })}>
            Manage plan
          </button>
        </div>

        <div className="usage-grid">
          <div className="usage-item">
            <div className="usage-head">
              <span>AI agents used</span>
              <strong>
                {limits.used ?? data.stats.assistants} / {limits.limit ?? 1}
              </strong>
            </div>
            <div className="usage-bar">
              <span style={{ width: `${agentPercent}%` }} />
            </div>
          </div>

          <div className="usage-item">
            <div className="usage-head">
              <span>Customers this month</span>
              <strong>
                {limits.customers ?? 0} / {limits.customerLimit ?? 50}
              </strong>
            </div>
            <div className="usage-bar">
              <span style={{ width: `${customerPercent}%` }} />
            </div>
          </div>

          {limits.creditLimit ? (
            <div className="usage-item">
              <div className="usage-head">
                <span>SBD AI credits this month</span>
                <strong>
                  {formatCredits(limits.creditsUsed)} / {formatCredits(limits.creditLimit)}
                </strong>
              </div>
              <div className={`usage-bar${creditsExhausted || creditsLow ? " usage-bar--low" : ""}`}>
                <span style={{ width: `${creditPercent}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        {limits.creditLimit && (creditsExhausted || creditsLow) ? (
          <div className="usage-lock">
            <p>
              {creditsExhausted
                ? `You have used all ${formatCredits(limits.creditLimit)} SBD AI credits on the ${limits.planName || "current"} plan this month, so new AI replies are paused. Renew or upgrade to keep answering customers.`
                : `Only ${formatCredits(limits.creditRemaining)} of your ${formatCredits(limits.creditLimit)} SBD AI credits are left this month.`}
            </p>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => onNavigate({ tab: "subscriptions" })}
            >
              {creditsExhausted ? "Renew or upgrade" : "View plans"}
            </button>
          </div>
        ) : null}

        {atAgentLimit ? (
          <div className="usage-lock">
            <p>
              You have reached the maximum number of AI agents allowed on your current plan. Upgrade your subscription
              to create additional AI agents.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => onNavigate({ tab: "subscriptions" })}
            >
              Upgrade plan
            </button>
          </div>
        ) : null}
      </section>

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
            Create an AI agent
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
