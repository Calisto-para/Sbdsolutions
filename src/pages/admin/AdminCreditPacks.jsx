import { useEffect, useState } from "react";
import { api } from "../../lib/api";

/* Operator-managed extra-credit packs. The customer purchase button stays
   disabled until at least one active pack exists, so no price or quantity is
   ever invented by the platform. */
export default function AdminCreditPacks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ name: "", credits: "", price: "", active: true, sortOrder: "0" });

  const load = () =>
    api("/admin/credit-packages")
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function create(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const result = await api("/admin/credit-packages", {
        method: "POST",
        body: {
          name: form.name,
          credits: Number(form.credits),
          price: Number(form.price),
          active: form.active,
          sortOrder: Number(form.sortOrder || 0),
        },
      });
      setNotice(result.message);
      setForm({ name: "", credits: "", price: "", active: true, sortOrder: "0" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function toggle(pack) {
    setBusy(pack.id);
    setError("");
    try {
      const result = await api(`/admin/credit-packages/${pack.id}`, {
        method: "PATCH",
        body: { active: !pack.active },
      });
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(pack) {
    if (!window.confirm(`Remove "${pack.name}"? Existing purchases are not affected.`)) return;
    setBusy(pack.id);
    setError("");
    try {
      const result = await api(`/admin/credit-packages/${pack.id}`, { method: "DELETE" });
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <div className="form-alert form-alert--error">{error}</div>;
  if (!data) return <div className="dash-loading">Loading credit packs…</div>;

  return (
    <div className="dash-stack">
      {error ? <div className="form-alert form-alert--error">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Additional-credit packs</h2>
          <p>
            You set the price and the number of credits. Customers can buy a pack only while it is active.
            Purchases are added to their account after the payment is verified.
          </p>
        </div>

        <form className="dash-form" onSubmit={create}>
          <div className="field">
            <label htmlFor="packName">Pack name</label>
            <input
              id="packName"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Booster pack"
              maxLength={80}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="packCredits">Credits</label>
            <input
              id="packCredits"
              type="number"
              min="1"
              step="1"
              value={form.credits}
              onChange={(event) => setForm({ ...form, credits: event.target.value })}
              placeholder="e.g. 5000"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="packPrice">Price (USD)</label>
            <input
              id="packPrice"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              placeholder="e.g. 10"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="packOrder">Sort order</label>
            <input
              id="packOrder"
              type="number"
              min="0"
              step="1"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </div>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy === "create"}>
            {busy === "create" ? "Creating…" : "Create pack"}
          </button>
        </form>

        {data.packages.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pack</th>
                  <th>Credits</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.packages.map((pack) => (
                  <tr key={pack.id}>
                    <td>{pack.name}</td>
                    <td>{pack.credits.toLocaleString("en-GB")}</td>
                    <td>
                      {pack.currency} {pack.price.toFixed(2)}
                    </td>
                    <td>
                      <span className={`admin-pill${pack.active ? "" : " admin-pill--muted"}`}>
                        {pack.active ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td>
                      <span className="panel-actions">
                        <button
                          type="button"
                          className="panel-link"
                          disabled={busy === pack.id}
                          onClick={() => toggle(pack)}
                        >
                          {pack.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="panel-link panel-link--danger"
                          disabled={busy === pack.id}
                          onClick={() => remove(pack)}
                        >
                          Remove
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            No credit packs yet, so customers cannot buy extra credits. Create the first pack above.
          </div>
        )}
        <p className="panel-note">
          Sold so far: {data.sold.purchases} purchase{data.sold.purchases === 1 ? "" : "s"} ·{" "}
          {data.sold.credits.toLocaleString("en-GB")} credits added.
        </p>
      </section>
    </div>
  );
}
