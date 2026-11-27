import { Link } from "react-router-dom";
import {
  SERVICES,
  PAYMENT_SPLIT,
  PRICE_DISCLAIMER,
  serviceExcludes,
  findService,
} from "../../shared/project-services";
import { formatMoney } from "../../shared/currencies";

function PriceCard({ service }) {
  const price = service.usd;
  const excludes = serviceExcludes(service);

  return (
    <article className="price-card reveal">
      <div className="price-card-head">
        <h3>{service.name}</h3>
        <span className="price-card-tag">Starting development price</span>
      </div>
      <p className="price-card-summary">{service.summary}</p>
      <p className="price-card-amount">{formatMoney(price, "USD")}</p>
      <p className="price-card-note">
        Not a final quotation. The final amount is confirmed in writing after your requirements are reviewed.
      </p>

      <details className="price-scope">
        <summary>
          <span>What&apos;s included — and what isn&apos;t</span>
          <span className="price-scope-toggle" aria-hidden="true">+</span>
        </summary>
        <div className="price-scope-body">
          <h4>Included in the development price</h4>
          <ul className="price-list price-list--in">
            {service.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>Paid separately by the customer</h4>
          <ul className="price-list price-list--out">
            {excludes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="price-scope-note">
            Database development needed for the agreed scope is part of SBD&apos;s work. Recurring database hosting and
            usage are third-party costs and are paid separately.
          </p>
        </div>
      </details>

      <Link
        className="btn btn--primary price-card-btn"
        to={`/start-a-project?service=${service.slug}`}
      >
        Request a Project
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </Link>
    </article>
  );
}

export default function Pricing() {
  const example = findService("business-website");
  const examplePrice = example.usd;
  const deposit = Math.round((examplePrice * PAYMENT_SPLIT.deposit) / 100);
  const final = Math.round((examplePrice * PAYMENT_SPLIT.final) / 100);

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <i>/</i>
              <span>Pricing</span>
            </nav>
            <h1>Clear starting prices. <span>No surprises.</span></h1>
            <p className="lead">
              Every project starts with a transparent US Dollar development price, a written scope and a final
              quotation before any payment is made. See exactly what each package includes.
            </p>
            <div className="btn-row">
              <Link className="btn btn--primary" to="/start-a-project">
                Request a Project
              </Link>
              <a className="btn btn--outline" href="#payment">How payment works</a>
            </div>
          </div>
          <aside className="page-tag">
            <strong>10</strong>
            <p>Project categories with fixed starting prices in US Dollars.</p>
          </aside>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <div className="pricing-head reveal">
            <div>
              <p className="eyebrow">Project pricing</p>
              <h2 className="section-title">Starting prices for <span>every service.</span></h2>
              <p className="pricing-intro">
                These amounts are SBD Solutions&apos; professional development fees, priced in US Dollars. At
                checkout you can pay in your local currency at the current exchange rate — the USD price stays the
                official amount. Third-party subscriptions, hosting and licences are not included.
              </p>
            </div>
          </div>

          <p className="pricing-disclaimer reveal">{PRICE_DISCLAIMER}</p>

          <div className="pricing-grid">
            {SERVICES.map((service) => (
              <PriceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      <section className="section section--surface">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">Transparency</p>
              <h2 className="section-title">What the starting price <span>does and does not cover.</span></h2>
            </div>
            <p className="lead">
              SBD&apos;s development work is included. Domain names, hosting, paid database services, premium
              software and other recurring third-party costs belong to the customer and are quoted separately.
            </p>
          </div>

          <div className="duo-grid">
            <div className="price-panel price-panel--in reveal">
              <h3>Included in the development fee</h3>
              <p>
                Design, development, database work required by the agreed scope, testing, deployment assistance and
                handover for the package you choose. Any support period is written into the final quotation.
              </p>
            </div>
            <div className="price-panel price-panel--out reveal">
              <h3>Paid separately by the customer</h3>
              <ul className="price-list price-list--out">
                <li>Domain registration and annual renewal</li>
                <li>Paid hosting or server subscription</li>
                <li>Paid database hosting and usage fees</li>
                <li>Premium themes, plugins, templates and licences</li>
                <li>Paid email services and external API usage</li>
                <li>Maintenance and support after the included period</li>
              </ul>
            </div>
          </div>

          <p className="note">
            We do not promise free lifetime domain registration, free lifetime hosting, unlimited database usage,
            unlimited maintenance or free premium third-party services. Ordinary database setup that is part of the
            agreed project is included in the development fee.
          </p>
        </div>
      </section>

      <section className="section" id="payment">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">From enquiry to payment</p>
              <h2 className="section-title">A quotation first. <span>Payment after approval.</span></h2>
            </div>
            <p className="lead">
              The starting price is not charged when you submit an enquiry. SBD reviews the requirements, prepares a
              final quotation and only then does payment begin.
            </p>
          </div>

          <ol className="process-list reveal">
            <li>
              <span>01</span>
              <div>
                <h3>Choose a service</h3>
                <p>Compare the packages and check what is included and what is paid separately.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Submit your requirements</h3>
                <p>Use the enquiry form to tell us about the business, the goal and any deadline.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>SBD reviews the enquiry</h3>
                <p>We check the scope, ask any clarifying questions and prepare a written quotation.</p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Quotation and approval</h3>
                <p>The quotation separates development charges from approved third-party costs.</p>
              </div>
            </li>
            <li>
              <span>05</span>
              <div>
                <h3>Payment begins</h3>
                <p>Once you approve the quotation, the agreed deposit is paid and development starts.</p>
              </div>
            </li>
          </ol>

          <div className="payment-split reveal">
            <div>
              <p className="eyebrow">Recommended arrangement</p>
              <h3>{PAYMENT_SPLIT.deposit}% upfront, {PAYMENT_SPLIT.final}% before launch</h3>
              <p>
                Unless a different arrangement is agreed in writing: {PAYMENT_SPLIT.deposit}% before development
                begins and {PAYMENT_SPLIT.final}% before final launch or handover.
              </p>
            </div>
            <dl className="payment-example">
              <div>
                <dt>{example.name} at {formatMoney(examplePrice, "USD")}</dt>
                <dd>
                  <span>Initial payment</span>
                  <strong>{formatMoney(deposit, "USD")}</strong>
                </dd>
                <dd>
                  <span>Final payment</span>
                  <strong>{formatMoney(final, "USD")}</strong>
                </dd>
              </div>
            </dl>
          </div>

          <p className="note">
            Domain registration, hosting, paid database services and other approved third-party expenses are
            communicated separately and paid by the customer. Nothing is charged without your approval of the final
            quotation.
          </p>
        </div>
      </section>

      <section className="section cta">
        <div className="container">
          <div className="cta-box reveal">
            <div>
              <h2>Ready to scope your project?</h2>
              <p>Pick a service and send the details. You will receive a written quotation before any payment.</p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn--primary" to="/start-a-project">
                Request a Project
              </Link>
              <a className="btn btn--ghost" href="https://wa.me/2349063924288" target="_blank" rel="noopener">
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
