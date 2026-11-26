import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { SERVICES, findService, startingPrice } from "../../shared/project-services";
import { CURRENCIES, currencyLabel, formatPrice, readCurrency, rememberCurrency } from "../lib/currency";

const BUDGETS = {
  NGN: [
    "Below ₦200,000",
    "₦200,000 – ₦400,000",
    "₦400,000 – ₦700,000",
    "₦700,000 – ₦1,500,000",
    "Above ₦1,500,000",
    "Not sure yet",
  ],
  USD: [
    "Below $200",
    "$200 – $400",
    "$400 – $700",
    "$700 – $1,500",
    "Above $1,500",
    "Not sure yet",
  ],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialForm = (initialService, initialCurrency) => ({
  fullName: "",
  businessName: "",
  email: "",
  phone: "",
  service: initialService || "",
  currency: initialCurrency || readCurrency(),
  estimatedBudget: "",
  description: "",
  additionalRequirements: "",
});

function validate(form) {
  const errors = {};
  if (form.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
  if (!EMAIL.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (form.phone.replace(/\D/g, "").length < 7) {
    errors.phone = "Enter a phone or WhatsApp number we can reach you on.";
  }
  if (!form.service) errors.service = "Choose the service you are enquiring about.";
  if (!CURRENCIES.includes(form.currency)) errors.currency = "Choose NGN or USD.";
  if (form.description.trim().length < 20) {
    errors.description = "Describe the project in at least 20 characters.";
  }
  return errors;
}

export default function ProjectForm({ initialService = "", initialCurrency = "" }) {
  const [form, setForm] = useState(() => initialForm(initialService, initialCurrency));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(null);

  /* The pricing page links here with ?service= and ?currency=, so the form opens
     with the chosen service and the price the visitor was just looking at. */
  useEffect(() => {
    setForm((current) => ({
      ...current,
      ...(initialService ? { service: initialService } : {}),
      ...(initialCurrency ? { currency: initialCurrency } : {}),
    }));
  }, [initialService, initialCurrency]);

  const selected = findService(form.service);
  const selectedPrice = selected ? startingPrice(selected, form.currency) : null;

  const update = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (status) setStatus(null);
  };

  const changeCurrency = (event) => {
    const currency = event.target.value;
    rememberCurrency(currency);
    setForm((current) => ({
      ...current,
      currency,
      /* Budget ranges carry a currency, so a range chosen in the old currency
         must not be submitted under the new one. */
      estimatedBudget: "",
    }));
    setErrors((current) => ({ ...current, currency: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    const found = validate(form);
    if (Object.keys(found).length) {
      setErrors(found);
      setStatus({ kind: "error", message: "Please check the highlighted fields and try again." });
      return;
    }

    setSending(true);
    setErrors({});
    try {
      const data = await api("/projects", {
        method: "POST",
        body: {
          ...form,
          fullName: form.fullName.trim(),
          businessName: form.businessName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          description: form.description.trim(),
          additionalRequirements: form.additionalRequirements.trim(),
        },
      });
      setSuccess(data);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors || {});
        setStatus({ kind: "error", message: error.message });
      } else {
        setStatus({
          kind: "error",
          message:
            "The enquiry could not be sent. Please try again, or email sbdiam.solutions@gmail.com or message us on WhatsApp (+234 906 392 4288).",
        });
      }
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setSuccess(null);
    setStatus(null);
    setErrors({});
    setForm(initialForm(initialService, initialCurrency));
  }

  if (success) {
    return (
      <div className="enquiry-success" role="status" aria-live="polite">
        <span className="enquiry-success-mark" aria-hidden="true">✓</span>
        <h3>Enquiry saved — {success.reference}</h3>
        <p>{success.message}</p>
        <dl className="enquiry-summary">
          <div>
            <dt>Service</dt>
            <dd>{success.service}</dd>
          </div>
          <div>
            <dt>Starting price shown</dt>
            <dd>{formatPrice(success.startingPrice.amount, success.startingPrice.currency)}</dd>
          </div>
          <div>
            <dt>What happens next</dt>
            <dd>SBD reviews your requirements and sends a final quotation before any payment.</dd>
          </div>
        </dl>
        {success.notification && !success.notification.delivered ? (
          <p className="enquiry-warning">
            Your enquiry is safely stored, but the notification email could not be delivered. The team can still see
            it. If you would like to be certain, email <a href="mailto:sbdiam.solutions@gmail.com">sbdiam.solutions@gmail.com</a>.
          </p>
        ) : null}
        <p className="enquiry-note">No payment has been taken. The starting price is not the final amount payable.</p>
        <button type="button" className="btn btn--ghost" onClick={reset}>
          Submit another enquiry
        </button>
      </div>
    );
  }

  return (
    <form className="project-form" data-project-form noValidate onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="full-name">Full Name *</label>
          <input
            id="full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Your full name"
            value={form.fullName}
            onChange={update("fullName")}
            aria-invalid={Boolean(errors.fullName)}
            required
          />
          {errors.fullName ? <span className="field-error-text">{errors.fullName}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="business-name">Business / Company Name</label>
          <input
            id="business-name"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder="Your business or organisation (optional)"
            value={form.businessName}
            onChange={update("businessName")}
          />
          {errors.businessName ? <span className="field-error-text">{errors.businessName}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="email">Email Address *</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={update("email")}
            aria-invalid={Boolean(errors.email)}
            required
          />
          {errors.email ? <span className="field-error-text">{errors.email}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="whatsapp">Phone / WhatsApp Number *</label>
          <input
            id="whatsapp"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+234 000 000 0000"
            value={form.phone}
            onChange={update("phone")}
            aria-invalid={Boolean(errors.phone)}
            required
          />
          {errors.phone ? <span className="field-error-text">{errors.phone}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="service">Selected Service *</label>
          <select
            id="service"
            name="service"
            value={form.service}
            onChange={update("service")}
            aria-invalid={Boolean(errors.service)}
            required
          >
            <option value="">Select a service</option>
            {SERVICES.map((service) => (
              <option key={service.slug} value={service.slug}>
                {service.name} — from {formatPrice(startingPrice(service, form.currency), form.currency)}
              </option>
            ))}
          </select>
          {errors.service ? <span className="field-error-text">{errors.service}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="currency">Preferred Currency *</label>
          <select
            id="currency"
            name="currency"
            value={form.currency}
            onChange={changeCurrency}
            aria-invalid={Boolean(errors.currency)}
            required
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>{currencyLabel(code)}</option>
            ))}
          </select>
          {errors.currency ? <span className="field-error-text">{errors.currency}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="budget">Estimated Budget</label>
          <select id="budget" name="estimatedBudget" value={form.estimatedBudget} onChange={update("estimatedBudget")}>
            <option value="">Select a budget range</option>
            {BUDGETS[form.currency].map((range) => (
              <option key={range} value={range}>{range}</option>
            ))}
          </select>
        </div>

        <div className="field field--full">
          <label htmlFor="description">Project Description *</label>
          <textarea
            id="description"
            name="description"
            rows="7"
            placeholder="Describe your business, what you need built or automated, and any deadline you are working towards."
            value={form.description}
            onChange={update("description")}
            aria-invalid={Boolean(errors.description)}
            required
          />
          {errors.description ? <span className="field-error-text">{errors.description}</span> : null}
        </div>

        <div className="field field--full">
          <label htmlFor="additional">Additional Requirements</label>
          <textarea
            id="additional"
            name="additionalRequirements"
            rows="4"
            placeholder="Any integrations, existing systems, branding or content you already have (optional)."
            value={form.additionalRequirements}
            onChange={update("additionalRequirements")}
          />
          {errors.additionalRequirements ? (
            <span className="field-error-text">{errors.additionalRequirements}</span>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="enquiry-price-note">
          <div>
            <span>Selected service</span>
            <strong>{selected.name}</strong>
          </div>
          <div>
            <span>Starting development price</span>
            <strong>{formatPrice(selectedPrice, form.currency)}</strong>
          </div>
        </div>
      ) : null}

      {status ? (
        <p
          className={`form-status is-visible form-status--${status.kind}`}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}

      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? "Sending your enquiry…" : "Submit Project Enquiry"}
        {sending ? null : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        )}
      </button>

      <p className="form-note">
        Your enquiry is saved securely and sent to sbdiam.solutions@gmail.com. Submitting it does not charge you or
        confirm a project — a final quotation is prepared first. Prefer WhatsApp?{" "}
        <a href="https://wa.me/2349063924288" target="_blank" rel="noopener">Message us directly</a>.
      </p>
    </form>
  );
}
