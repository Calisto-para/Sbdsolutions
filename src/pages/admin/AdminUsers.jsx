import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { shortDate } from "./AdminOverview";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowance, setAllowance] = useState("");

  const load = (search = "") => {
    setError("");
    api(`/admin/users?q=${encodeURIComponent(search)}`)
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setDetailError("");
    api(`/admin/users/${selected}`)
      .then(setDetail)
      .catch((err) => setDetailError(err.message));
  }, [selected]);

  useEffect(() => {
    if (!detail) return;
    const assigned = detail.subscription?.agentAllowance;
    setAllowance(assigned == null ? "" : String(assigned));
  }, [detail]);

  const saveAllowance = async () => {
    setSaving(true);
    setDetailError("");
    try {
      const value = allowance === "" ? null : Number(allowance);
      await api(`/admin/users/${detail.user.id}`, { method: "PATCH", body: { agentAllowance: value } });
      setDetail({
        ...detail,
        subscription: { ...(detail.subscription || {}), agentAllowance: value },
      });
      load(query);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setSuspended = async (suspended) => {
    const verb = suspended ? "Suspend" : "Reactivate";
    if (!window.confirm(`${verb} ${detail.user.fullName}'s account?`)) return;
    setSaving(true);
    setDetailError("");
    try {
      const result = await api(`/admin/users/${detail.user.id}`, {
        method: "PATCH",
        body: { suspended, suspendedReason: suspended ? "Suspended by operator" : "" },
      });
      setDetail({
        ...detail,
        user: { ...detail.user, suspended: Boolean(result.user.suspended) },
      });
      load(query);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setRole = async (role) => {
    setSaving(true);
    setDetailError("");
    try {
      await api(`/admin/users/${detail.user.id}`, { method: "PATCH", body: { role } });
      setDetail({ ...detail, user: { ...detail.user, role } });
      load(query);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="form-alert form-alert--error">{error}</div>;

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <h2>Customers</h2>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load(query);
            }}
          >
            <input
              type="search"
              placeholder="Name, email or business"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search customers"
            />
            <button type="submit" className="btn btn--ghost btn--sm">
              Search
            </button>
          </form>
        </div>

        {!users ? (
          <div className="dash-loading">Loading accounts…</div>
        ) : users.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Business</th>
                  <th>Status</th>
                  <th>Assistants</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.fullName}</strong>
                      <span>{user.email}</span>
                    </td>
                    <td>{user.businessName || "—"}</td>
                    <td>
                      <span className={`admin-pill${user.role === "admin" ? " admin-pill--admin" : ""}`}>
                        {user.role === "admin" ? "Operator" : "Client"}
                      </span>
                      {user.emailVerified ? null : <span className="admin-pill admin-pill--muted">Unverified</span>}
                      {user.suspended ? <span className="admin-pill admin-pill--muted">Suspended</span> : null}
                    </td>
                    <td>{user.assistants}</td>
                    <td>{shortDate(user.createdAt)}</td>
                    <td>
                      <button type="button" className="panel-link" onClick={() => setSelected(user.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No accounts match that search.</div>
        )}
      </section>

      {selected ? (
        <section className="panel">
          <div className="panel-head panel-head--row">
            <h2>Account details</h2>
            <button type="button" className="panel-link" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          {detailError ? <div className="form-alert form-alert--error">{detailError}</div> : null}
          {!detail ? (
            <div className="dash-loading">Loading account…</div>
          ) : (
            <div className="admin-detail">
              <dl className="admin-facts">
                <div>
                  <dt>Name</dt>
                  <dd>{detail.user.fullName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    {detail.user.email} {detail.user.emailVerified ? "· verified" : "· unverified"}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{detail.user.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{detail.user.country || "—"}</dd>
                </div>
                <div>
                  <dt>Business</dt>
                  <dd>{detail.business?.name || detail.user.businessName || "—"}</dd>
                </div>
                <div>
                  <dt>Joined</dt>
                  <dd>{shortDate(detail.user.createdAt)}</dd>
                </div>
              </dl>

              <div className="admin-detail-actions">
                <span className="admin-pill">{detail.user.role === "admin" ? "Operator" : "Client"}</span>
                {detail.user.suspended ? (
                  <span className="admin-pill admin-pill--muted">Suspended</span>
                ) : null}
                {detail.user.id === me?.id ? null : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    disabled={saving}
                    onClick={() => setSuspended(!detail.user.suspended)}
                  >
                    {detail.user.suspended ? "Reactivate account" : "Suspend account"}
                  </button>
                )}
                {detail.user.id === me?.id ? (
                  <span className="admin-stat-note">This is your own account.</span>
                ) : detail.user.role === "admin" ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={saving}
                    onClick={() => setRole("client")}
                  >
                    Remove operator access
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={saving}
                    onClick={() => setRole("admin")}
                  >
                    Make operator
                  </button>
                )}
              </div>

              <h3 className="admin-subhead">AI agent allowance</h3>
              <div className="admin-allowance">
                <div>
                  <p className="admin-stat-note">
                    Current plan: {detail.subscription?.planId || "starter"}. Standard plans use their fixed agent
                    limit; Enterprise accounts are limited to the allowance set here.
                  </p>
                  <label className="admin-allowance-field">
                    <span>Maximum AI agents</span>
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      value={allowance}
                      onChange={(event) => setAllowance(event.target.value)}
                      placeholder="Not assigned"
                    />
                  </label>
                </div>
                <button className="btn btn--primary btn--sm" type="button" disabled={saving} onClick={saveAllowance}>
                  Save allowance
                </button>
              </div>

              {detail.user.suspended ? (
                <p className="form-alert form-alert--error">
                  This account is suspended: sign-in is blocked and the API refuses its session.
                </p>
              ) : null}

              <h3 className="admin-subhead">Assistants</h3>
              {detail.assistants.length ? (
                <ul className="activity-list">
                  {detail.assistants.map((assistant) => (
                    <li key={assistant.id}>
                      <strong>{assistant.name}</strong>
                      <span>
                        {assistant.conversations} conversations · {assistant.knowledgeItems} training items ·{" "}
                        {assistant.active ? "active" : "paused"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty empty--sm">No assistants yet.</div>
              )}

              <h3 className="admin-subhead">Recent conversations</h3>
              {detail.conversations.length ? (
                <ul className="activity-list">
                  {detail.conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <strong>{conversation.title}</strong>
                      <span>
                        {conversation.assistantName} · {conversation.messageCount} messages ·{" "}
                        {shortDate(conversation.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty empty--sm">No conversations yet.</div>
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
