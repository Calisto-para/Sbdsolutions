import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Field from "../../components/auth/Field";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeFailed, setNoticeFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await login(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
      setUnverified(err.code === "EMAIL_UNVERIFIED");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const data = await api("/auth/resend-verification", { method: "POST", body: { email: form.email } });
      setNotice(data.message);
      setNoticeFailed(data.emailDelivered === false);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to manage your AI assistants, training material and conversations."
      footer={
        <span>
          New here? <Link to="/register">Create an account</Link>
        </span>
      }
    >
      {error ? <div className="form-alert form-alert--error" role="alert">{error}</div> : null}
      {notice ? (
        <div className={`form-alert ${noticeFailed ? "form-alert--error" : "form-alert--info"}`} role="status">
          {notice}
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Email address" htmlFor="loginEmail">
          <input id="loginEmail" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
        </Field>
        <Field label="Password" htmlFor="loginPassword">
          <input id="loginPassword" type="password" autoComplete="current-password" value={form.password} onChange={update("password")} required />
        </Field>

        <div className="auth-row">
          <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
          {unverified ? (
            <button className="auth-link auth-link--button" type="button" onClick={resend}>Resend verification email</button>
          ) : null}
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
