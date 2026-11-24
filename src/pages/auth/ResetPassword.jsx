import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Field from "../../components/auth/Field";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});

    try {
      await api("/auth/reset-password", { method: "POST", body: { token, ...form } });
      await refresh();
      navigate("/dashboard.html");
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="Reset link missing"
        intro="This page needs the link from your reset email."
        footer={<span><Link to="/forgot-password.html">Request a new link</Link></span>}
      >
        <div className="form-alert form-alert--error">No reset token was found in this link.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro="Pick something you have not used before. You will be signed in straight away."
      footer={<span><Link to="/login.html">Back to sign in</Link></span>}
    >
      {error ? <div className="form-alert form-alert--error" role="alert">{error}</div> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="New password" htmlFor="newPassword" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <input id="newPassword" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmNewPassword" error={errors.confirmPassword}>
          <input id="confirmNewPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update("confirmPassword")} required />
        </Field>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
