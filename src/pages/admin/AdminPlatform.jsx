import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { shortDate } from "./AdminOverview";

const number = (value) => new Intl.NumberFormat("en-GB").format(value || 0);
const compact = (value) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(value || 0));
const usd = (value) => `$${Number(value || 0).toFixed(4)}`;

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
      api(`/admin/usage`),
    ])
      .then(([platform, businesses, assistants, usage]) => {
        setData({ ...platform, businesses, assistants, usage });
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

  const usage = data.usage || null;

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

      {usage ? (
        <section className="panel">
          <div className="panel-head">
            <h2>AI usage and spend</h2>
            <p>
              Internal OpenAI costs for {usage.monthLabel}. Customers only see SBD AI credits, never these
              dollar figures.
            </p>
          </div>

          <div className="stat-grid admin-stats">
            <div className="stat-card">
              <span className="stat-value">{usd(usage.totals.costUsd)}</span>
              <span className="stat-label">OpenAI spend this month</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{compact(usage.totals.credits)}</span>
              <span className="stat-label">SBD credits consumed this month</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{number(usage.totals.requests)}</span>
              <span className="stat-label">Billable AI requests</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{compact(usage.totals.promptTokens + usage.totals.completionTokens)}</span>
              <span className="stat-label">Input and output tokens</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{compact(usage.totals.cachedTokens)}</span>
              <span className="stat-label">Cached input tokens</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{usd(usage.totals.allTimeCostUsd)}</span>
              <span className="stat-label">All-time OpenAI spend</span>
            </div>
          </div>

          <div className="panel-head" style={{ marginTop: 18 }}>
            <h3>Cost per customer</h3>
            <p>Every customer's monthly credits, internal spend and token use.</p>
          </div>
          {usage.customers.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th>Credits</th>
                    <th>API spend</th>
                    <th>Tokens in / out</th>
                    <th>Cached</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.customers.map((customer) => (
                    <tr key={customer.userId}>
                      <td>
                        <strong>{customer.name}</strong>
                        <span>{customer.email}</span>
                      </td>
                      <td>{customer.planName}</td>
                      <td>
                        {number(customer.creditsUsed)}
                        {customer.creditLimit != null ? ` / ${number(customer.creditLimit)}` : ""}
                      </td>
                      <td>
                        {usd(customer.spendingUsed)}
                        {customer.spendingCap != null ? ` / $${customer.spendingCap}` : ""}
                      </td>
                      <td>
                        {compact(customer.promptTokens)} / {compact(customer.completionTokens)}
                      </td>
                      <td>{compact(customer.cachedTokens)}</td>
                      <td>
                        <span
                          className={`admin-pill${customer.atLimit || customer.approaching ? " admin-pill--muted" : ""}`}
                        >
                          {customer.atLimit ? "At limit" : customer.approaching ? "Near limit" : "Within limit"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No customer accounts yet.</div>
          )}

          <div className="panel-head" style={{ marginTop: 18 }}>
            <h3>Usage per plan</h3>
          </div>
          {usage.plans.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Customers</th>
                    <th>Credits used</th>
                    <th>Internal API spend</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.plans.map((plan) => (
                    <tr key={plan.planId}>
                      <td><strong>{plan.planName}</strong></td>
                      <td>{number(plan.customers)}</td>
                      <td>{number(plan.creditsUsed)}</td>
                      <td>{usd(plan.spendingUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No plan usage yet.</div>
          )}
        </section>
      ) : null}

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
