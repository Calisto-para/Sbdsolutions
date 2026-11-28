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

  const setupSteps = [
    {
      key: "plan",
      title: "Activate your plan",
      text: "Pick the plan that matches your traffic. Nothing is charged until payment is verified.",
      done: Boolean(limits.planActive),
      tab: "subscriptions",
      cta: limits.planActive ? "Manage plan" : "Choose a plan",
    },
    {
      key: "assistant",
      title: "Create an AI assistant",
      text: "Give it a name and the business details customers ask about.",
      done: data.stats.assistants > 0,
      tab: "assistants",
      cta: data.stats.assistants > 0 ? "Open assistants" : "Create assistant",
    },
    {
      key: "knowledge",
      title: "Add your business knowledge",
      text: "Services, prices, FAQs and documents — what the assistant is allowed to answer from.",
      done: data.stats.knowledgeItems > 0,
      tab: "knowledge",
      cta: data.stats.knowledgeItems > 0 ? "Review knowledge" : "Add knowledge",
    },
    {
      key: "conversation",
      title: "Install the widget and test it",
      text: "Copy the install script from Website Chatbot, then send the first test message.",
      done: data.stats.conversations > 0,
      tab: "chatbot",
      cta: data.stats.conversations > 0 ? "Open website chatbot" : "Get the script",
    },
  ];
  const setupDone = setupSteps.filter((step) => step.done).length;
  const setupPercent = Math.round((setupDone / setupSteps.length) * 100);
  const nextStep = setupSteps.find((step) => !step.done);

  return (
    <div className="dash-stack">
      {setupDone < setupSteps.length ? (
        <section className="panel onboard" aria-labelledby="onboard-title">
          <div className="onboard-head">
            <div>
              <h2 id="onboard-title">Finish setting up</h2>
              <p>
                {setupDone} of {setupSteps.length} steps complete. Each step uses real account data, so this list
                disappears once everything is working.
              </p>
            </div>
            <span className="onboard-count">{setupPercent}%</span>
          </div>
          <div className="onboard-bar" role="presentation">
            <span style={{ width: `${setupPercent}%` }} />
          </div>
          <ol className="onboard-steps">
            {setupSteps.map((step) => (
              <li key={step.key} className={step.done ? "is-done" : undefined}>
                <span className="onboard-check" aria-hidden="true">
                  {step.done ? "✓" : ""}
                </span>
                <div className="onboard-copy">
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
                <button
                  type="button"
                  className={`btn btn--sm ${nextStep?.key === step.key ? "btn--primary" : "btn--outline"}`}
                  onClick={() => onNavigate({ tab: step.tab })}
                >
                  {step.cta}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
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
