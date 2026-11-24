import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Field from "../../components/auth/Field";
import { api } from "../../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setPreviewUrl("");

    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: { email } });
      setMessage(data.message);
      setPreviewUrl(data.previewUrl || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter the email address on your account and we will send a link to choose a new password."
      footer={
        <span>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </span>
      }
    >
      {error ? <div className="form-alert form-alert--error" role="alert">{error}</div> : null}
      {message ? (
        <div className={`form-alert ${previewUrl ? "form-alert--info" : "form-alert--ok"}`} role="status">
          <p>{message}</p>
          {previewUrl ? <a className="form-alert-link" href={previewUrl}>Open the reset link</a> : null}
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Email address" htmlFor="forgotEmail">
          <input
            id="forgotEmail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
