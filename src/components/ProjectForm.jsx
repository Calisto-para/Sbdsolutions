import { useState } from "react";

/* Public form endpoint — FormSubmit forwards each enquiry to the business inbox. */
const ENDPOINT = "https://formsubmit.co/ajax/sbdiam.solutions@gmail.com";

const SUCCESS =
  "Thank you — your enquiry has been sent. We will review the details and reply to you by email or WhatsApp, usually within one business day.";
const FAILURE =
  "Sorry, the enquiry could not be sent from this page. Please email sbdiam.solutions@gmail.com or message us on WhatsApp (+234 906 392 4288) and we will pick it up from there.";

export default function ProjectForm() {
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (typeof form.reportValidity === "function" && !form.reportValidity()) return;

    const payload = Object.fromEntries(new FormData(form).entries());
    payload._subject = "New project enquiry — SBD AI Solutions";
    payload._template = "table";
    payload._captcha = "false";

    setSending(true);
    setStatus({ kind: "ok", message: "Sending your enquiry…" });

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === "false") throw new Error("Request rejected");
      form.reset();
      setStatus({ kind: "ok", message: SUCCESS });
    } catch {
      setStatus({ kind: "error", message: FAILURE });
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      data-project-form
      action="https://formsubmit.co/sbdiam.solutions@gmail.com"
      method="POST"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="full-name">Full Name *</label>
          <input id="full-name" name="Full Name" type="text" autoComplete="name" placeholder="Your full name" required />
        </div>
        <div className="field">
          <label htmlFor="business-name">Business Name</label>
          <input id="business-name" name="Business Name" type="text" autoComplete="organization" placeholder="Your business or organisation" />
        </div>
        <div className="field">
          <label htmlFor="email">Email Address *</label>
          <input id="email" name="Email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </div>
        <div className="field">
          <label htmlFor="whatsapp">WhatsApp Number *</label>
          <input id="whatsapp" name="WhatsApp Number" type="tel" autoComplete="tel" placeholder="+234 000 000 0000" required />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" name="Country" type="text" autoComplete="country-name" placeholder="Nigeria" />
        </div>
        <div className="field">
          <label htmlFor="service">Type of Service Required *</label>
          <select id="service" name="Service Required" required defaultValue="">
            <option value="">Select a service</option>
            <option>AI Solutions</option>
            <option>AI Chatbot Development</option>
            <option>WhatsApp Automation</option>
            <option>Business Process Automation</option>
            <option>Website Development</option>
            <option>E-commerce Development</option>
            <option>Custom Software Development</option>
            <option>Other Technology Solutions</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="budget">Project Budget *</label>
          <select id="budget" name="Project Budget" required defaultValue="">
            <option value="">Select a budget range</option>
            <option>Below $100</option>
            <option>$100–$300</option>
            <option>$300–$500</option>
            <option>$500–$1,000</option>
            <option>Above $1,000</option>
            <option>Not yet determined</option>
          </select>
        </div>
        <div className="field field--full">
          <label htmlFor="description">Project Description *</label>
          <textarea
            id="description"
            name="Project Description"
            rows="7"
            placeholder="Describe your business, what you need built or automated, and any deadline you are working towards."
            required
          />
        </div>
      </div>

      <input
        type="text"
        name="_honey"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px" }}
        aria-hidden="true"
      />
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Submit Project Enquiry"}{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>

      <p
        className={`form-status${status ? ` is-visible form-status--${status.kind}` : ""}`}
        data-form-status
        role="status"
        aria-live="polite"
      >
        {status?.message}
      </p>
      <p className="form-note">
        Your enquiry is sent to sbdiam.solutions@gmail.com and is not stored on this website. Prefer WhatsApp?{" "}
        <a href="https://wa.me/2349063924288" target="_blank" rel="noopener">Message us directly</a>.
      </p>
    </form>
  );
}
