import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

export default function AccountSettings() {
  const { user, setUser, logout } = useAuth();
  const [profile, setProfile] = useState({
    fullName: user.fullName || "",
    businessName: user.businessName || "",
    email: user.email || "",
    phone: user.phone || "",
    country: user.country || "",
  });
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [prefs, setPrefs] = useState({
    productUpdates: Boolean(user.preferences?.productUpdates),
    conversationAlerts: user.preferences?.conversationAlerts !== false,
  });
  const [prefsNotice, setPrefsNotice] = useState("");

  const updateProfile = (key) => (event) => setProfile((current) => ({ ...current, [key]: event.target.value }));

  async function saveProfile(event) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await api("/auth/profile", { method: "PATCH", body: { ...profile, preferences: prefs } });
      setUser(data.user);
      setProfileNotice(data.message);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordNotice("");
    try {
      const data = await api("/auth/password", { method: "PATCH", body: passwords });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordNotice(data.message);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function savePreferences() {
    setPrefsNotice("");
    try {
      const data = await api("/auth/profile", { method: "PATCH", body: { ...profile, preferences: prefs } });
      setUser(data.user);
      setPrefsNotice("Preferences saved.");
    } catch (err) {
      setPrefsNotice(err.message);
    }
  }

  return (
    <div className="dash-columns dash-columns--settings">
      <section className="panel panel--form">
        <div className="panel-head">
          <h2>Personal information</h2>
          <p>Keep your contact details up to date.</p>
        </div>
        {profileError ? <div className="form-alert form-alert--error">{profileError}</div> : null}
        {profileNotice ? <div className="form-alert form-alert--ok">{profileNotice}</div> : null}

        <form className="dash-form" onSubmit={saveProfile}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="setName">Full name</label>
              <input id="setName" value={profile.fullName} onChange={updateProfile("fullName")} required />
            </div>
            <div className="field">
              <label htmlFor="setBusiness">Business name</label>
              <input id="setBusiness" value={profile.businessName} onChange={updateProfile("businessName")} />
            </div>
            <div className="field">
              <label htmlFor="setEmail">Email address</label>
              <input id="setEmail" type="email" value={profile.email} onChange={updateProfile("email")} required />
            </div>
            <div className="field">
              <label htmlFor="setPhone">Phone number</label>
              <input id="setPhone" value={profile.phone} onChange={updateProfile("phone")} />
            </div>
            <div className="field">
              <label htmlFor="setCountry">Country</label>
              <input id="setCountry" value={profile.country} onChange={updateProfile("country")} />
            </div>
          </div>
          <button className="btn btn--primary" type="submit" disabled={profileBusy}>
            {profileBusy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="panel panel--form">
        <div className="panel-head">
          <h2>Password</h2>
          <p>Use at least 8 characters with a letter and a number.</p>
        </div>
        {passwordError ? <div className="form-alert form-alert--error">{passwordError}</div> : null}
        {passwordNotice ? <div className="form-alert form-alert--ok">{passwordNotice}</div> : null}

        <form className="dash-form" onSubmit={savePassword}>
          <div className="field">
            <label htmlFor="currentPassword">Current password</label>
            <input id="currentPassword" type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} required />
          </div>
          <button className="btn btn--primary" type="submit" disabled={passwordBusy}>
            {passwordBusy ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Preferences</h2>
          <p>Choose what we email you about.</p>
        </div>
        {prefsNotice ? <div className="form-alert form-alert--ok">{prefsNotice}</div> : null}

        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.conversationAlerts}
            onChange={(e) => setPrefs({ ...prefs, conversationAlerts: e.target.checked })}
          />
          <span>Email me when an assistant handles a new conversation</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.productUpdates}
            onChange={(e) => setPrefs({ ...prefs, productUpdates: e.target.checked })}
          />
          <span>Send me product updates and tips</span>
        </label>

        <div className="dash-actions">
          <button className="btn btn--ghost" type="button" onClick={savePreferences}>Save preferences</button>
          <button
            className="btn btn--ghost btn--danger"
            type="button"
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
