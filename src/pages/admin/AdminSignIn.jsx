import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Field from "../../components/auth/Field";

/* Deliberately plain: the operator entry point does not advertise what it is. */
export default function AdminSignIn() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-gate">
      <form className="admin-gate-card auth-form" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="panel-note">Use your SBD Solutions account.</p>

        {error ? <div className="form-alert form-alert--error">{error}</div> : null}

        <Field label="Email" htmlFor="admin-email">
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>

        <Field label="Password" htmlFor="admin-password">
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
