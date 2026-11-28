import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  deleteToken,
  enablePhoneNotifications,
  existingToken,
  pushSupport,
} from "../../lib/push";

const PREF_LABELS = [
  { key: "email", label: "Email notifications", note: "Owner alerts sent to your account email." },
  { key: "humanRequests", label: "New human support requests", note: "A visitor asks for a person, or leaves an offline enquiry." },
  { key: "newMessages", label: "New customer messages", note: "A visitor replies while you are handling their chat." },
  { key: "unanswered", label: "Unanswered conversations", note: "Chats waiting for a reply." },
  { key: "usageWarnings", label: "Usage warnings", note: "Credit and unique-customer thresholds." },
  { key: "push", label: "Phone notifications", note: "Push to the devices you enable below." },
];

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const statusText = (value) =>
  value === "sent" ? "emailed" : value === "failed" ? "email failed" : value === "partial" ? "some devices" : "";

const pushText = (value) =>
  value === "sent" ? "phone sent" : value === "failed" ? "phone failed" : value === "partial" ? "some phones" : value === "no-devices" ? "" : "";

export default function Notifications({ onNavigate }) {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [support, setSupport] = useState(null);

  const load = () =>
    Promise.all([api("/notifications"), api("/notifications/push/config")])
      .then(([centre, push]) => {
        setData(centre);
        setPrefs(centre.preferences);
        setConfig(push);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    setSupport(pushSupport());
    existingToken(null).catch(() => {});
  }, []);

  async function toggle(key, value) {
    setBusy(key);
    setError("");
    try {
      const result = await api("/notifications/preferences", {
        method: "PATCH",
        body: { [key]: value },
      });
      setPrefs(result.preferences);
      setNotice("Preferences saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function enable() {
    setBusy("enable");
    setError("");
    setNotice("");
    try {
      const token = await enablePhoneNotifications(config);
      const result = await api("/notifications/push/devices", {
        method: "POST",
        body: {
          token,
          label: navigator.userAgent.includes("Android") ? "Android device" : "This browser",
          platform: "web",
          userAgent: navigator.userAgent.slice(0, 300),
        },
      });
      setData((current) => ({ ...current, push: { ...(current?.push || {}), devices: result.devices } }));
      setPrefs((current) => ({ ...current, push: true }));
      setNotice(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function disable() {
    setBusy("disable");
    setError("");
    try {
      await api("/notifications/preferences", { method: "PATCH", body: { push: false } });
      const token = await existingToken(config);
      if (token) await api("/notifications/push/devices/remove", { method: "POST", body: { token } });
      await deleteToken(config);
      setPrefs((current) => ({ ...current, push: false }));
      setNotice("Phone notifications are off for this browser.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function removeDevice(id) {
    setBusy(`device-${id}`);
    try {
      const result = await api(`/notifications/push/devices/${id}`, { method: "DELETE" });
      setData((current) => ({ ...current, push: { ...(current?.push || {}), devices: result.devices } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    setNotice("");
    try {
      const result = await api("/notifications/push/test", { method: "POST" });
      setNotice(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function markAll() {
    setBusy("read-all");
    try {
      await api("/notifications/read-all", { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function markOne(id) {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      setData((current) => ({
        ...current,
        unread: Math.max(0, (current?.unread || 1) - 1),
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, read: true } : item
        ),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  function openNotification(item) {
    if (!item.read) markOne(item.id);
    if (item.link) {
      const url = new URL(item.link, window.location.origin);
      const tab = url.searchParams.get("tab");
      const conversation = url.searchParams.get("conversation");
      if (onNavigate) onNavigate(conversation ? { tab, conversation } : { tab });
      else window.location.assign(item.link);
    }
  }

  if (error && !data) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading notifications…</div>;

  const devices = data.push?.devices || [];
  const configured = Boolean(config?.enabled);
  const iosHint = support?.needsHomeScreen;

  return (
    <div className="dash-stack">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Phone notifications</h2>
            <p>Get alerted on your phone when a visitor needs a person or sends a new message.</p>
          </div>
          <span className={`admin-pill${prefs?.push && configured ? "" : " admin-pill--muted"}`}>
            {prefs?.push && configured ? "On" : configured ? "Off" : "Not configured"}
          </span>
        </div>

        {!configured ? (
          <div className="form-alert form-alert--error">
            Push notifications are not configured on this server yet. An administrator needs to add the Firebase
            project keys (project id, service account, web API key, app id, sender id and VAPID key) to the service
            environment. In-app and email notifications keep working.
          </div>
        ) : null}

        {iosHint ? (
          <div className="form-alert">
            <strong>iPhone or iPad:</strong> add this site to your Home Screen first — tap Share, then Add to Home
            Screen. Open it from the Home Screen before enabling notifications.
          </div>
        ) : null}
        {!support?.secure ? (
          <div className="form-alert">Phone notifications need this site to be served over HTTPS.</div>
        ) : null}

        <div className="panel-actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={enable}
            disabled={!configured || busy === "enable"}
          >
            {busy === "enable" ? "Enabling…" : "Enable Phone Notifications"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={disable}
            disabled={busy === "disable"}
          >
            Disable phone notifications
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={test}
            disabled={!devices.length || busy === "test"}
          >
            {busy === "test" ? "Sending…" : "Send test notification"}
          </button>
        </div>

        <div className="device-list">
          <h3>Your devices</h3>
          {devices.length ? (
            <ul>
              {devices.map((device) => (
                <li key={device.id}>
                  <div>
                    <strong>{device.label}</strong>
                    <span>
                      Added {timeFormat.format(new Date(device.createdAt))} · last seen{" "}
                      {timeFormat.format(new Date(device.lastSeenAt))}
                      {device.lastError ? ` · ${device.lastError}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="panel-link panel-link--danger"
                    onClick={() => removeDevice(device.id)}
                    disabled={busy === `device-${device.id}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">No devices yet. Enable notifications on this phone or browser.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Notification preferences</h2>
          <p>Email notifications keep working independently of phone notifications.</p>
        </div>
        <div className="pref-grid">
          {PREF_LABELS.map((item) => (
            <label className="pref-row" key={item.key}>
              <span>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(prefs?.[item.key])}
                disabled={busy === item.key || (item.key === "push" && !configured)}
                onChange={(event) => toggle(item.key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Notification centre</h2>
            <p>
              {data.unread
                ? `${data.unread} unread notification${data.unread === 1 ? "" : "s"}`
                : "You are all caught up."}
            </p>
          </div>
          <button type="button" className="panel-link" onClick={markAll} disabled={!data.unread || busy === "read-all"}>
            Mark all as read
          </button>
        </div>

        {data.notifications.length ? (
          <ul className="notification-list">
            {data.notifications.map((item) => (
              <li key={item.id} className={item.read ? "" : "is-unread"}>
                <button type="button" className="notification-main" onClick={() => openNotification(item)}>
                  <span className={`notification-dot notification-dot--${item.level}`} aria-hidden="true" />
                  <span className="notification-body">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>
                      {timeFormat.format(new Date(item.createdAt))}
                      {statusText(item.emailStatus) ? ` · ${statusText(item.emailStatus)}` : ""}
                      {pushText(item.pushStatus) ? ` · ${pushText(item.pushStatus)}` : ""}
                      {item.read ? " · read" : " · unread"}
                    </small>
                  </span>
                </button>
                {!item.read ? (
                  <button type="button" className="panel-link" onClick={() => markOne(item.id)}>
                    Mark read
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No notifications yet. Support requests and usage warnings appear here.</div>
        )}
      </section>
    </div>
  );
}
