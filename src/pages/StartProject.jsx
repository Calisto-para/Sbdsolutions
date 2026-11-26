import { Link, useSearchParams } from "react-router-dom";
import ProjectForm from "../components/ProjectForm";
import { findService, startingPrice } from "../../shared/project-services";
import { formatPrice } from "../lib/currency";

export default function StartProject() {
  const [params] = useSearchParams();
  const service = findService(params.get("service"));
  const currency = params.get("currency") === "NGN" ? "NGN" : params.get("currency") === "USD" ? "USD" : "";
  const price = service ? startingPrice(service, currency || "USD") : null;
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>Start a Project</span></nav>
        <h1>Let's Start Your <span>Project.</span></h1>
        <p className="lead">Tell us about your business, project or technology requirements. Our team will review your enquiry and get back to you with the next steps.</p>
      </div>
      <aside className="page-tag">
        <strong>01–2 days</strong>
        <p>Enquiries are reviewed personally, usually within one business day.</p>
      </aside>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="form-card form-card--wide reveal">
        <h2>{service ? `Project enquiry — ${service.name}` : "Project enquiry"}</h2>
        <p>
          The more detail you give, the more useful our first reply will be. Fields marked with an asterisk are
          required.{" "}
          {service && currency ? (
            <>
              Starting development price for this package: <strong>{formatPrice(price, currency)}</strong>. The final
              quotation is confirmed after review — nothing is charged now.{" "}
            </>
          ) : null}
          <Link to="/pricing">Compare all project prices</Link>.
        </p>

        <ProjectForm initialService={service?.slug || ""} initialCurrency={currency} />
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">What happens next</p>
          <h2 className="section-title">From enquiry to <span>development.</span></h2>
        </div>
      </div>
      <div className="steps reveal">
        <div className="step">
          <span>01</span>
          <h3>We reply</h3>
          <p>You get a personal response by email or WhatsApp, usually within one business day.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>We talk</h3>
          <p>A short conversation to understand the requirement and the constraint.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>We propose</h3>
          <p>You receive a written outline of the solution we recommend and why.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>We agree</h3>
          <p>Scope, timeline and pricing confirmed before work begins.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Not ready to submit a form?</h2>
          <p>Send a short message with the goal and we will tell you what the work actually involves.</p>
        </div>
        <div className="cta-actions">
          <a className="btn btn--primary" href="https://wa.me/2349063924288" target="_blank" rel="noopener">Chat on WhatsApp</a>
          <a className="btn btn--ghost" href="mailto:sbdiam.solutions@gmail.com">Send an email</a>
        </div>
      </div>
    </div>
  </section>
    </>
  );
}
