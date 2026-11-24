import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { refresh, isAuthenticated } = useAuth();
  const [state, setState] = useState(token ? "checking" : "missing");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    api("/auth/verify-email", { method: "POST", body: { token } })
      .then(async (data) => {
        setMessage(data.message);
        setState("verified");
        await refresh();
      })
      .catch((error) => {
        setMessage(error.message);
        setState("failed");
      });
  }, [token, refresh]);

  return (
    <AuthShell
      title="Email verification"
      intro={state === "checking" ? "Confirming your email address…" : undefined}
    >
      {state === "checking" ? <div className="verify-spinner" aria-live="polite">Checking your link…</div> : null}

      {state === "verified" ? (
        <div className="form-alert form-alert--ok" role="status">
          <p>{message}</p>
          <Link className="btn btn--primary btn--block" to="/dashboard.html">Go to my dashboard</Link>
        </div>
      ) : null}

      {state === "failed" ? (
        <div className="form-alert form-alert--error" role="alert">
          <p>{message}</p>
          <Link className="auth-link" to="/login.html">Back to sign in</Link>
        </div>
      ) : null}

      {state === "missing" ? (
        <div className="form-alert form-alert--error" role="alert">
          <p>This page needs the link from your verification email.</p>
          <Link className="auth-link" to="/login.html">Back to sign in</Link>
        </div>
      ) : null}

      {isAuthenticated && state === "verified" ? (
        <p className="auth-note">Signed in as a verified customer.</p>
      ) : null}
    </AuthShell>
  );
}
