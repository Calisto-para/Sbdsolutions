import { useEffect, useState } from "react";
import { api } from "../../lib/api";

/* Shows whether the configured sending account is accepted by the provider,
   and lets an operator prove it with a real test message. */
export default function AdminEmail() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api("/admin/email")
      .then(setStatus)
      .catch((err) => setError(err.message));
  }, []);

  const sendTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api("/admin/email-test", { method: "POST" }));
    } catch (err) {
      setResult({ delivered: false, message: err.message, failures: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head panel-head--row">
        <h2>Email delivery</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={sendTest} disabled={busy}>
          {busy ? "Sending…" : "Send test email to me"}
        </button>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {!status && !error ? <div className="dash-loading">Checking the sending account…</div> : null}

      {status ? (
        <div className="admin-email">
          <div className={`admin-mail-state ${status.ok ? "is-ok" : "is-bad"}`}>
            <span className="admin-pill">{status.ok ? "Working" : "Not delivering"}</span>
            <strong>{status.summary}</strong>
          </div>

          <dl className="admin-facts">
            <div>
              <dt>Provider</dt>
              <dd>{status.provider === "none" ? "Not configured" : status.provider}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{status.sender || "—"}</dd>
            </div>
            <div>
              <dt>Reply-to</dt>
              <dd>{status.replyTo || "—"}</dd>
            </div>
          </dl>

          {status.hint ? <div className="form-alert form-alert--error">{status.hint}</div> : null}

          {status.checks?.map((check) => (
            <p key={check.provider} className="panel-note">
              <strong>{check.provider}:</strong> {check.message}
            </p>
          ))}
        </div>
      ) : null}

      {result ? (
        <div className={`form-alert ${result.delivered ? "form-alert--ok" : "form-alert--error"}`} role="status">
          <p>{result.message}</p>
          {result.failures?.length ? (
            <ul className="admin-mail-failures">
              {result.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
