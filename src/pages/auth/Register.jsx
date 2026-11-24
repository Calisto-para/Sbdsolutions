import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Field from "../../components/auth/Field";
import { api } from "../../lib/api";

const EMPTY = {
  fullName: "",
  businessName: "",
  email: "",
  phone: "",
  country: "",
  password: "",
  confirmPassword: "",
};

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    setPreviewUrl("");

    try {
      const data = await api("/auth/register", { method: "POST", body: form });
      setMessage(data.message);
      setPreviewUrl(data.previewUrl || "");
      setForm(EMPTY);
    } catch (error) {
      setErrors(error.fieldErrors || {});
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      intro="Set up your SBD AI Solutions account to build, train and test AI assistants for your business."
      footer={
        <span>
          Already registered? <Link to="/login.html">Sign in</Link>
        </span>
      }
    >
      {message ? (
        <div className={`form-alert ${previewUrl ? "form-alert--info" : "form-alert--ok"}`} role="status">
          <p>{message}</p>
          {previewUrl ? (
            <a className="form-alert-link" href={previewUrl}>Open your verification link</a>
          ) : null}
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Full name *" htmlFor="fullName" error={errors.fullName}>
          <input id="fullName" name="fullName" type="text" autoComplete="name" value={form.fullName} onChange={update("fullName")} required />
        </Field>
        <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
          <input id="businessName" name="businessName" type="text" autoComplete="organization" value={form.businessName} onChange={update("businessName")} />
        </Field>
        <Field label="Email address *" htmlFor="regEmail" error={errors.email}>
          <input id="regEmail" name="email" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
        </Field>
        <Field label="Phone number *" htmlFor="phone" error={errors.phone}>
          <input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} required />
        </Field>
        <Field label="Country *" htmlFor="country" error={errors.country}>
          <input id="country" name="country" type="text" autoComplete="country-name" value={form.country} onChange={update("country")} required />
        </Field>
        <Field label="Password *" htmlFor="regPassword" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <input id="regPassword" name="password" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} required />
        </Field>
        <Field label="Confirm password *" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update("confirmPassword")} required />
        </Field>

        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="auth-legal">
          By creating an account you agree to be contacted about your project. We never share your details.
        </p>
      </form>
    </AuthShell>
  );
}
