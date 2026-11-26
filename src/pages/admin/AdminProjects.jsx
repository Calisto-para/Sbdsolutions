import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { shortDate } from "./AdminOverview";

const STATUSES = ["New", "Reviewing", "Quoted", "Approved", "Rejected", "Completed"];
const PAYMENT_STATUSES = ["Unpaid", "Deposit paid", "Part paid", "Paid", "Refunded"];

const money = (amount, currency) =>
  currency === "NGN"
    ? `₦${Number(amount || 0).toLocaleString("en-NG")}`
    : `$${Number(amount || 0).toLocaleString("en-US")}`;

const statusClass = (status) =>
  ["Approved", "Completed"].includes(status)
    ? "admin-pill"
    : status === "Rejected"
      ? "admin-pill admin-pill--muted"
      : "admin-pill admin-pill--admin";

const formFrom = (project) => ({
  status: project.status,
  quotationAmount: project.quotationAmount === null ? "" : String(project.quotationAmount),
  quotationCurrency: project.quotationCurrency || project.currency,
  includedServices: project.includedServices || "",
  costLines: project.costLines.length ? project.costLines.map((line) => ({ ...line, amount: String(line.amount) })) : [],
  paymentArrangement:
    project.paymentArrangement || "60% upfront before development begins; 40% before final launch or handover",
  paymentStatus: project.paymentStatus || "Unpaid",
  paymentReference: project.paymentReference || "",
  note: "",
});

/* Project enquiries and quotations. The starting price is never charged here;
   an operator reviews the request, records a final quotation and tracks the
   customer's approval and payment manually. */
export default function AdminProjects() {
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (nextFilter = filter, search = query) => {
    setError("");
    const params = new URLSearchParams();
    if (nextFilter) params.set("status", nextFilter);
    if (search.trim()) params.set("q", search.trim());
    return api(`/admin/projects?${params}`)
      .then((result) => {
        setData(result);
        return result;
      })
      .catch((err) => {
        setError(err.message);
        return null;
      });
  };

  useEffect(() => {
    load().then((result) => {
      if (result?.enquiries.length) openProject(result.enquiries[0].id);
    });
  }, []);

  async function openProject(id) {
    setError("");
    setNotice("");
    try {
      const result = await api(`/admin/projects/${id}`);
      setProject(result.project);
      setForm(formFrom(result.project));
    } catch (err) {
      setError(err.message);
    }
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const updateCost = (index, key, value) =>
    setForm((current) => ({
      ...current,
      costLines: current.costLines.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    }));

  const addCost = () =>
    setForm((current) => ({ ...current, costLines: [...current.costLines, { label: "", amount: "" }] }));

  const removeCost = (index) =>
    setForm((current) => ({ ...current, costLines: current.costLines.filter((_, i) => i !== index) }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const costLines = form.costLines
        .filter((line) => line.label.trim() && line.amount !== "")
        .map((line) => ({ label: line.label.trim(), amount: Number(line.amount) }));
      const result = await api(`/admin/projects/${project.id}`, {
        method: "PATCH",
        body: {
          status: form.status,
          quotationAmount: form.quotationAmount === "" ? null : Number(form.quotationAmount),
          quotationCurrency: form.quotationCurrency,
          includedServices: form.includedServices,
          costLines,
          paymentArrangement: form.paymentArrangement,
          paymentStatus: form.paymentStatus,
          paymentReference: form.paymentReference,
          note: form.note,
        },
      });
      setProject(result.project);
      setForm(formFrom(result.project));
      setNotice(result.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const quotation = Number(form?.quotationAmount || 0);
  const additional = (form?.costLines || []).reduce((total, line) => total + Number(line.amount || 0), 0);

  return (
    <div className="dash-stack">
      <section className="panel">
        <div className="panel-head panel-head--row">
          <div>
            <h2>Project enquiries</h2>
            <p>Review requests, prepare quotations and track approval. Submitting an enquiry never charges anyone.</p>
          </div>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              load();
            }}
          >
            <input
              type="search"
              placeholder="Name, business, email or phone"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search project enquiries"
            />
            <button type="submit" className="btn btn--ghost btn--sm">Search</button>
          </form>
        </div>

        <div className="filters">
          <button
            type="button"
            className={`btn btn--sm ${filter === "" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => { setFilter(""); load(""); }}
          >
            All
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`btn btn--sm ${filter === status ? "btn--primary" : "btn--ghost"}`}
              onClick={() => { setFilter(status); load(status); }}
            >
              {status}
            </button>
          ))}
        </div>

        {error ? <div className="form-alert form-alert--error">{error}</div> : null}
        {notice ? <div className="form-alert form-alert--ok">{notice}</div> : null}

        {!data ? (
          <div className="dash-loading">Loading project enquiries…</div>
        ) : data.enquiries.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Starting price</th>
                  <th>Budget</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {data.enquiries.map((enquiry) => (
                  <tr
                    key={enquiry.id}
                    onClick={() => openProject(enquiry.id)}
                    className={project?.id === enquiry.id ? "is-selected" : ""}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <strong>{enquiry.fullName}</strong>
                      <span>{enquiry.businessName || enquiry.email}</span>
                    </td>
                    <td>{enquiry.serviceName}</td>
                    <td>{money(enquiry.startingPrice.amount, enquiry.startingPrice.currency)}</td>
                    <td>{enquiry.estimatedBudget || "—"}</td>
                    <td>{shortDate(enquiry.createdAt)}</td>
                    <td><span className={statusClass(enquiry.status)}>{enquiry.status}</span></td>
                    <td><span className="admin-stat-note">{enquiry.paymentStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No project enquiries in this view yet.</div>
        )}
      </section>

      {project && form ? (
        <section className="panel">
          <div className="panel-head panel-head--row">
            <div>
              <h2>{project.serviceName}</h2>
              <p>
                {project.reference} · submitted {shortDate(project.createdAt)} ·{" "}
                notification {project.notificationStatus}
              </p>
            </div>
            <span className={statusClass(project.status)}>{project.status}</span>
          </div>

          {project.notificationError ? (
            <div className="form-alert form-alert--error">
              Notification email failed: {project.notificationError}
            </div>
          ) : null}

          <div className="project-admin-grid">
            <div className="project-detail">
              <dl className="admin-facts">
                <div>
                  <dt>Full name</dt>
                  <dd>{project.fullName}</dd>
                </div>
                <div>
                  <dt>Business</dt>
                  <dd>{project.businessName || "—"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd><a href={`mailto:${project.email}`}>{project.email}</a></dd>
                </div>
                <div>
                  <dt>Phone / WhatsApp</dt>
                  <dd><a href={`tel:${project.phone}`}>{project.phone}</a></dd>
                </div>
                <div>
                  <dt>Preferred currency</dt>
                  <dd>{project.currency}</dd>
                </div>
                <div>
                  <dt>Starting price shown</dt>
                  <dd>{money(project.startingPrice.amount, project.startingPrice.currency)}</dd>
                </div>
                <div>
                  <dt>Estimated budget</dt>
                  <dd>{project.estimatedBudget || "—"}</dd>
                </div>
                <div>
                  <dt>Payment status</dt>
                  <dd>{project.paymentStatus}</dd>
                </div>
                <div>
                  <dt>Payment reference</dt>
                  <dd>{project.paymentReference || "—"}</dd>
                </div>
              </dl>

              <div>
                <h3 className="admin-subhead">Project description</h3>
                <p className="project-description">{project.description}</p>
              </div>

              {project.additionalRequirements ? (
                <div>
                  <h3 className="admin-subhead">Additional requirements</h3>
                  <p className="project-description">{project.additionalRequirements}</p>
                </div>
              ) : null}

              <div className="project-quote-summary">
                <div>
                  <span>Development quotation</span>
                  <strong>{money(quotation, form.quotationCurrency)}</strong>
                </div>
                <div>
                  <span>Additional costs</span>
                  <strong>{money(additional, form.quotationCurrency)}</strong>
                </div>
                <div>
                  <span>Quoted total</span>
                  <strong>{money(quotation + additional, form.quotationCurrency)}</strong>
                </div>
              </div>
            </div>

            <form className="dash-form project-quote-form" onSubmit={save}>
              <h3 className="admin-subhead">Quotation and progress</h3>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="projectStatus">Enquiry status</label>
                  <select id="projectStatus" value={form.status} onChange={update("status")}>
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="paymentStatus">Payment status</label>
                  <select id="paymentStatus" value={form.paymentStatus} onChange={update("paymentStatus")}>
                    {PAYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="quotationAmount">Final quotation amount</label>
                  <input
                    id="quotationAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quotationAmount}
                    onChange={update("quotationAmount")}
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label htmlFor="quotationCurrency">Quotation currency</label>
                  <select id="quotationCurrency" value={form.quotationCurrency} onChange={update("quotationCurrency")}>
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="field field--full">
                  <label htmlFor="includedServices">Included services</label>
                  <textarea
                    id="includedServices"
                    rows="3"
                    value={form.includedServices}
                    onChange={update("includedServices")}
                    placeholder="What the development fee covers in this quotation."
                  />
                </div>
                <div className="field field--full">
                  <label>Additional third-party costs</label>
                  {form.costLines.length ? (
                    <div className="cost-lines">
                      {form.costLines.map((line, index) => (
                        <div className="cost-line-row" key={index}>
                          <input
                            value={line.label}
                            onChange={(event) => updateCost(index, "label", event.target.value)}
                            placeholder="Domain, hosting, licences…"
                            aria-label="Cost description"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.amount}
                            onChange={(event) => updateCost(index, "amount", event.target.value)}
                            placeholder="0.00"
                            aria-label="Cost amount"
                          />
                          <button type="button" className="panel-link panel-link--danger" onClick={() => removeCost(index)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-note">No additional costs recorded.</p>
                  )}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={addCost}>
                    Add a cost line
                  </button>
                </div>
                <div className="field field--full">
                  <label htmlFor="paymentArrangement">Agreed payment arrangement</label>
                  <textarea id="paymentArrangement" rows="2" value={form.paymentArrangement} onChange={update("paymentArrangement")} />
                </div>
                <div className="field field--full">
                  <label htmlFor="paymentReference">Payment / transaction reference</label>
                  <input id="paymentReference" value={form.paymentReference} onChange={update("paymentReference")} placeholder="Bank transfer or payment reference" />
                </div>
                <div className="field field--full">
                  <label htmlFor="projectNote">History note</label>
                  <input id="projectNote" value={form.note} onChange={update("note")} placeholder="Optional note for the enquiry history" />
                </div>
              </div>

              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save quotation"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="admin-subhead">History</h3>
            {project.history.length ? (
              <ul className="project-history">
                {[...project.history].reverse().map((entry, index) => (
                  <li key={index}>
                    <strong>{entry.note}</strong>
                    <span>{entry.by} · {new Date(entry.at).toLocaleString("en-GB")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-note">No changes recorded yet.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
