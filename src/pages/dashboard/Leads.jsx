import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function Leads() {
  const [leads, setLeads] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = (search = "") => {
    setError("");
    api(`/leads?q=${encodeURIComponent(search)}`)
      .then((data) => setLeads(data.leads))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!leads) return <div className="dash-loading">Loading leads…</div>;

  const withContact = leads.filter((lead) => lead.email || lead.phone).length;

  return (
    <div className="dash-stack">
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{leads.length}</span>
          <span className="stat-label">Enquiries collected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{withContact}</span>
          <span className="stat-label">With contact details</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{new Set(leads.map((lead) => lead.assistantName)).size}</span>
          <span className="stat-label">Assistants collecting</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Leads</h2>
            <p>Visitors who shared their details with your chatbot.</p>
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
              placeholder="Name, email, phone or service"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search leads"
            />
            <button type="submit" className="btn btn--ghost btn--sm">Search</button>
          </form>
        </div>

        {leads.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Contact</th>
                  <th>Needs</th>
                  <th>Assistant</th>
                  <th>Collected</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.name || "Unnamed visitor"}</strong>
                      <span>{lead.conversationTitle || "Website chat"}</span>
                    </td>
                    <td>
                      {lead.email ? <span>{lead.email}</span> : null}
                      {lead.phone ? <span>{lead.phone}</span> : null}
                      {!lead.email && !lead.phone ? <span>No contact yet</span> : null}
                    </td>
                    <td>{lead.service || "—"}</td>
                    <td>{lead.assistantName}</td>
                    <td>{dateFormat.format(new Date(lead.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            No leads yet. Once your chatbot is on your website, enquiries appear here automatically.
          </div>
        )}
      </section>
    </div>
  );
}
