import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminIntegrations() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/admin/integrations")
      .then((data) => setItems(data.integrations || []))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!items) return <div className="dash-loading">Checking integrations…</div>;

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Integrations</h2>
          <p>
            Status is derived from server-side configuration. No key, token or secret is ever sent to the browser.
            Webhook configuration is listed separately from API credentials because a payment can verify without
            receiving webhooks.
          </p>
        </div>
        <div className="integration-list">
          {items.map((item) => (
            <article className="integration-card" key={item.key}>
              <div className="integration-head">
                <h3>{item.name}</h3>
                <span className={`integration-status ${item.connected ? "is-on" : "is-off"}`}>
                  {item.connected ? "Configured" : "Not configured"}
                </span>
              </div>
              <p>{item.note}</p>
              {typeof item.webhook === "boolean" ? (
                <p className={`ticket-meta`}>Webhook secret: {item.webhook ? "configured" : "not configured"}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
