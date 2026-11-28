import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { installInstructions, usePwaInstall } from "../lib/pwa";

/* A single install experience for the whole site: a dismissible banner using
   the browser's own prompt where it exists, and written instructions where it
   does not (notably Safari on iPhone and iPad). */

export function InstallInstructions({ platform, compact = false }) {
  const steps = installInstructions(platform);
  return (
    <ol className={compact ? "pwa-steps pwa-steps--compact" : "pwa-steps"}>
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export default function PwaInstall() {
  const pwa = usePwaInstall();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (pwa.installed || pwa.dismissed) return undefined;
    const authPage = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"].includes(
      location.pathname
    );
    if (authPage) return undefined;
    /* Give the page a moment before asking; never on first paint. */
    const timer = window.setTimeout(() => setVisible(true), 6000);
    return () => window.clearTimeout(timer);
  }, [pwa.installed, pwa.dismissed, location.pathname]);

  const install = async () => {
    if (!pwa.canInstall) {
      setSheet(true);
      return;
    }
    const result = await pwa.install();
    if (result.outcome === "accepted") {
      setVisible(false);
      setNotice("Installing SBD Solutions…");
    } else if (result.outcome === "dismissed") {
      pwa.dismiss();
      setVisible(false);
    }
  };

  return (
    <>
      {visible && !pwa.installed ? (
        <aside className="pwa-banner" role="dialog" aria-labelledby="pwa-title" aria-describedby="pwa-body">
          <img src="/pwa-192.png" alt="" width="52" height="52" className="pwa-banner__icon" />
          <div className="pwa-banner__copy">
            <h2 id="pwa-title">Install SBD Solutions</h2>
            <p id="pwa-body">
              Add SBD Solutions to your device for quicker access to your dashboard and services.
            </p>
            <div className="pwa-banner__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={install}>
                {pwa.canInstall ? "Install App" : "How to install"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  pwa.dismiss();
                  setVisible(false);
                }}
              >
                Maybe Later
              </button>
              <button type="button" className="pwa-link" onClick={() => setSheet(true)}>
                Instructions
              </button>
            </div>
          </div>
          <button
            type="button"
            className="pwa-banner__close"
            aria-label="Close install prompt"
            onClick={() => {
              pwa.dismiss();
              setVisible(false);
            }}
          >
            ×
          </button>
        </aside>
      ) : null}

      {notice ? <div className="pwa-toast" role="status">{notice}</div> : null}

      {sheet ? (
        <div className="pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-sheet-title">
          <div className="pwa-modal__card">
            <div className="pwa-modal__head">
              <img src="/pwa-192.png" alt="" width="44" height="44" />
              <div>
                <h2 id="pwa-sheet-title">Install SBD Solutions</h2>
                <p>
                  {pwa.ios
                    ? `On ${pwa.iosBrowser || "Safari"} for iPhone and iPad, add the site from the Share menu.`
                    : pwa.canInstall
                      ? "Your browser can install this app. Use the Install App button, or the browser's own menu."
                      : "This browser does not offer automatic installation, but you can still add the app where supported."}
                </p>
              </div>
            </div>
            <InstallInstructions platform={pwa} />
            <div className="pwa-modal__actions">
              {pwa.canInstall ? (
                <button type="button" className="btn btn--primary btn--sm" onClick={install}>
                  Install App
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* Settings card: always available, including after the banner was dismissed. */
export function InstallCard() {
  const pwa = usePwaInstall();
  const [showSteps, setShowSteps] = useState(false);
  const [message, setMessage] = useState("");

  const install = async () => {
    const result = await pwa.install();
    if (result.outcome === "accepted") setMessage("Installation started. Your browser will finish it.");
    else if (result.outcome === "dismissed") setMessage("Installation was cancelled. You can try again any time.");
    else setMessage("This browser cannot show the install prompt. Follow the steps below.");
    if (result.outcome === "unavailable") setShowSteps(true);
  };

  return (
    <section className="panel" id="install-app">
      <div className="panel-head">
        <h2>Install SBD Solutions</h2>
        <p>Use the dashboard as an app on this device — same account, same data.</p>
      </div>

      <p className="pwa-status">
        <span className={`admin-pill${pwa.installed ? "" : " admin-pill--muted"}`}>
          {pwa.installed ? "Installed on this device" : pwa.canInstall ? "Ready to install" : "Not installed"}
        </span>
        {!pwa.installed && !pwa.canInstall ? (
          <span className="admin-stat-note">
            {pwa.ios
              ? "iPhone and iPad install from Safari's Share menu."
              : "This browser does not offer automatic installation; instructions are below."}
          </span>
        ) : null}
      </p>

      {message ? <div className="form-alert">{message}</div> : null}

      <div className="dash-actions">
        {pwa.canInstall ? (
          <button type="button" className="btn btn--primary" onClick={install}>
            Install App
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={() => setShowSteps((value) => !value)}>
          {showSteps ? "Hide instructions" : "Installation instructions"}
        </button>
        {pwa.dismissed ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={pwa.resetDismissal}>
            Show install prompt again
          </button>
        ) : null}
      </div>

      {showSteps || !pwa.canInstall ? (
        <div className="pwa-instructions">
          <h3>How to install</h3>
          <InstallInstructions platform={pwa} compact />
          <p className="admin-stat-note">
            Notifications do not require installing the app: browser notifications work in a normal tab wherever
            your browser supports them. If your browser does not support installation, everything still works here.
          </p>
        </div>
      ) : null}
    </section>
  );
}
