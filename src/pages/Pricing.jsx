import { Link } from "react-router-dom";
import {
  SERVICES,
  PAYMENT_SPLIT,
  PRICE_DISCLAIMER,
  serviceExcludes,
  findService,
} from "../../shared/project-services";
import { formatMoney } from "../../shared/currencies";

const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4 10-10" />
  </svg>
);

const arrow = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const CHATBOT_PLANS = [
  { name: "Starter", price: "$15", credits: "3,000", websites: "1 website" },
  { name: "Professional", price: "$35", credits: "10,000", websites: "Up to 3 websites", featured: true },
  { name: "Business", price: "$65", credits: "25,000", websites: "Up to 10 websites" },
  { name: "Enterprise", price: "Custom", credits: "Custom", websites: "Custom" },
];

const WHATSAPP_PLANS = [
  { name: "Basic", price: "$7", customers: "50", replies: "1,000" },
  { name: "Starter", price: "$29", customers: "500", replies: "2,500" },
  { name: "Professional", price: "$59", customers: "1,000", replies: "5,000", featured: true },
  { name: "Business", price: "$79", customers: "2,000", replies: "10,000" },
  { name: "Enterprise", price: "Custom", customers: "Custom", replies: "Custom" },
];

function ProjectPriceCard({ service }) {
  const excludes = serviceExcludes(service);

  return (
    <article className="hm-project-price">
      <div className="hm-project-price-head">
        <h3>{service.name}</h3>
        <span className="hm-project-amount">{formatMoney(service.usd, "USD")}</span>
      </div>
      <p className="hm-project-summary">{service.summary}</p>
      <details className="hm-project-scope">
        <summary>
          <span>What is included</span>
          <i aria-hidden="true" />
        </summary>
        <ul className="hm-project-list">
          {service.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {excludes.length ? (
          <>
            <p className="hm-project-sub">Paid separately</p>
            <ul className="hm-project-list hm-project-list--out">
              {excludes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
      <p className="hm-project-note">Starting price · final quotation after review</p>
      <Link className="hm-btn hm-btn--ghost hm-btn--sm" to={`/start-a-project?service=${service.slug}`}>
        Request a project {arrow}
      </Link>
    </article>
  );
}

export default function Pricing() {
  const example = findService("business-website");
  const deposit = Math.round((example.usd * PAYMENT_SPLIT.deposit) / 100);
  const final = Math.round((example.usd * PAYMENT_SPLIT.final) / 100);

  return (
    <div className="hm">
      <section className="hm-hero">
        <div className="container hm-hero-grid">
          <div className="hm-hero-copy">
            <span className="hm-pill">
              <span className="hm-pill-dot" /> Pricing
            </span>
            <h1>Product plans and project prices, kept separate.</h1>
            <p className="hm-lead">
              Monthly software plans for the AI chatbot and, when early access opens, WhatsApp automation. Project
              work — websites, software and systems — is quoted separately with a written scope.
            </p>
            <div className="hm-actions">
              <a className="hm-btn hm-btn--primary" href="#chatbot">Chatbot plans {arrow}</a>
              <Link className="hm-btn hm-btn--ghost" to="/start-a-project">Request a quotation</Link>
            </div>
            <ul className="hm-trust">
              <li>{check} US Dollar pricing</li>
              <li>{check} No automatic plan changes</li>
              <li>{check} Cancel from the dashboard</li>
            </ul>
          </div>
          <div className="hm-product-side">
            <article className="hm-side-card">
              <span className="hm-eyebrow">Software subscription</span>
              <h3>Website AI Chatbot</h3>
              <p>From $15 / month</p>
              <Link className="hm-link" to="#chatbot">See the plans {arrow}</Link>
            </article>
            <article className="hm-side-card hm-side-card--soon">
              <span className="hm-eyebrow">Early access</span>
              <h3>WhatsApp AI Automation</h3>
              <p>From $7 / month when it launches</p>
              <Link className="hm-link" to="#whatsapp">Planned plans {arrow}</Link>
            </article>
            <article className="hm-side-card hm-side-card--demo">
              <span className="hm-eyebrow">Project work</span>
              <h3>Websites & custom software</h3>
              <p>From $200, scoped and quoted in writing</p>
              <Link className="hm-link" to="#projects">Project prices {arrow}</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="hm-section" id="chatbot">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">SBD Website AI Chatbot</p>
              <h2>Monthly plans by credit and website allowance.</h2>
            </div>
            <p className="hm-head-lead">
              Credits pay for AI usage. Website allowance is how many sites can run the same trained assistant.
              Unique customers are counted separately and are not capped by these plans.
            </p>
          </div>

          <div className="hm-table-wrap">
            <table className="hm-table">
              <caption className="hm-visually-hidden">Website AI Chatbot subscription plans</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Monthly price</th>
                  <th scope="col">AI credits / month</th>
                  <th scope="col">Website allowance</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {CHATBOT_PLANS.map((plan) => (
                  <tr key={plan.name} className={plan.featured ? "is-featured" : undefined}>
                    <th scope="row">
                      {plan.name}
                      {plan.featured ? <span className="hm-table-tag">Popular</span> : null}
                    </th>
                    <td data-label="Monthly price">{plan.price}</td>
                    <td data-label="AI credits / month">{plan.credits}</td>
                    <td data-label="Website allowance">{plan.websites}</td>
                    <td className="hm-table-action">
                      {plan.name === "Enterprise" ? (
                        <Link className="hm-link" to="/start-a-project">Talk to us {arrow}</Link>
                      ) : (
                        <Link className="hm-link" to="/register">Get started {arrow}</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hm-note">
            Plans renew monthly. Reaching the credit allowance pauses billable AI replies until you upgrade or buy
            additional credits — your data is never deleted. Plan changes happen only after you confirm them and
            payment is verified.
          </p>
        </div>
      </section>

      <section className="hm-section hm-section--tint" id="whatsapp">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">SBD WhatsApp AI Automation</p>
              <h2>Early-access plans, published in advance.</h2>
            </div>
            <p className="hm-head-lead">
              The WhatsApp product is in development on the official WhatsApp Business platform. These plans are
              informational: no WhatsApp subscription is billable today.
            </p>
          </div>

          <div className="hm-included">
            <span className="hm-included-icon">{check}</span>
            <div>
              <h3>WhatsApp Messaging Included</h3>
              <p>
                Your SBD Solutions subscription includes applicable WhatsApp messaging charges covered by SBD
                Solutions, together with AI automation within your selected plan&apos;s usage limits.
              </p>
              <p>
                No separate Meta messaging payment is required from you for usage covered under your plan. Additional
                usage may require a plan upgrade or an approved custom arrangement.
              </p>
            </div>
          </div>

          <div className="hm-table-wrap">
            <table className="hm-table">
              <caption className="hm-visually-hidden">WhatsApp AI Automation early-access plans</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Monthly price</th>
                  <th scope="col">Unique customers / month</th>
                  <th scope="col">AI replies / month</th>
                </tr>
              </thead>
              <tbody>
                {WHATSAPP_PLANS.map((plan) => (
                  <tr key={plan.name} className={plan.featured ? "is-featured" : undefined}>
                    <th scope="row">
                      {plan.name}
                      {plan.featured ? <span className="hm-table-tag">Popular</span> : null}
                    </th>
                    <td data-label="Monthly price">{plan.price}</td>
                    <td data-label="Unique customers / month">{plan.customers}</td>
                    <td data-label="AI replies / month">{plan.replies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hm-actions">
            <Link className="hm-btn hm-btn--primary" to="/start-a-project?service=whatsapp-ai-automation">
              Register your interest {arrow}
            </Link>
            <Link className="hm-btn hm-btn--ghost" to="/products#whatsapp">Read product details</Link>
          </div>
        </div>
      </section>

      <section className="hm-section">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Understanding the limits</p>
              <h2>Credits, customers and websites are three different things.</h2>
            </div>
          </div>
          <div className="hm-feature-grid hm-feature-grid--three">
            <article className="hm-panel-card">
              <h3>AI credits</h3>
              <p>
                The unit that pays for AI work. A short answer costs less than a long answer that pulls in more
                context. Credits reset each billing period, and purchased credits are kept separately.
              </p>
            </article>
            <article className="hm-panel-card">
              <h3>Unique customers</h3>
              <p>
                How many different people the assistant spoke to in the period. The same visitor returning ten times
                counts once. This is measured on the WhatsApp plans and shown in the dashboard.
              </p>
            </article>
            <article className="hm-panel-card">
              <h3>Website allowance</h3>
              <p>
                How many websites can run the assistant on your plan. All installations share one knowledge base,
                inbox and credit balance.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="hm-section">
        <div className="container">
          <div className="hm-custom-offer">
            <div>
              <p className="hm-eyebrow">Outside the standard plans</p>
              <h2>Need different limits, several numbers or custom terms?</h2>
              <p>
                Send the expected volume, the features you need and how you prefer to be billed. We will reply with a
                written custom offer — its own price and allowances, without changing the published plans.
              </p>
            </div>
            <div className="hm-custom-actions">
              <Link className="hm-btn hm-btn--primary" to="/start-a-project">
                Request a custom plan {arrow}
              </Link>
              <span className="hm-side-hint">Mention “custom plan” in the requirements field.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="hm-section hm-section--tint" id="projects">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Project work</p>
              <h2>Websites, software and systems — starting prices.</h2>
            </div>
            <p className="hm-head-lead">
              {PRICE_DISCLAIMER} Project prices are separate from the monthly product plans above.
            </p>
          </div>

          <div className="hm-project-grid">
            {SERVICES.map((service) => (
              <ProjectPriceCard key={service.slug} service={service} />
            ))}
          </div>

          <p className="hm-note">
            Domain names, hosting, paid database services and other recurring third-party costs are paid by the
            customer and quoted separately. Nothing is charged before you approve the written quotation.
          </p>
        </div>
      </section>

      <section className="hm-section" id="payment">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">How project payment works</p>
              <h2>A quotation first. Payment after approval.</h2>
            </div>
            <p className="hm-head-lead">
              Submitting an enquiry is free. SBD reviews the requirements, prepares a written quotation, and only then
              does payment begin — {PAYMENT_SPLIT.deposit}% before development and {PAYMENT_SPLIT.final}% before
              launch unless agreed otherwise.
            </p>
          </div>
          <div className="hm-payment-example">
            <div>
              <span>Example — {example.name}</span>
              <strong>{formatMoney(example.usd, "USD")}</strong>
            </div>
            <div>
              <span>Initial payment ({PAYMENT_SPLIT.deposit}%)</span>
              <strong>{formatMoney(deposit, "USD")}</strong>
            </div>
            <div>
              <span>Before launch ({PAYMENT_SPLIT.final}%)</span>
              <strong>{formatMoney(final, "USD")}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="hm-section hm-section--cta">
        <div className="container">
          <div className="hm-cta">
            <div className="hm-cta-copy">
              <p className="hm-eyebrow hm-eyebrow--light">Start here</p>
              <h2>Pick the plan that fits, or ask us to scope something custom.</h2>
              <p>
                Create an account to subscribe to the chatbot, or send an enquiry for project work and custom
                pricing. You will always see the amount before paying.
              </p>
            </div>
            <div className="hm-cta-actions">
              <Link className="hm-btn hm-btn--light" to="/register">Create an account {arrow}</Link>
              <Link className="hm-btn hm-btn--outline-light" to="/start-a-project">Send an enquiry</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
