import { Link } from "react-router-dom";

export default function Services() {
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>Services</span></nav>
        <h1>AI, Automation &amp; <span>Technology Solutions</span></h1>
        <p className="lead">SBD AI Solutions helps businesses transform their operations through artificial intelligence, intelligent automation and custom software development. We create practical technology solutions that simplify processes, improve customer experiences and support business growth.</p>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/start-a-project.html">Start a Project</Link>
          <a className="btn btn--outline" href="#ai-solutions">Jump to services</a>
        </div>
      </div>
      <aside className="page-tag">
        <strong>03</strong>
        <p>Core service areas: artificial intelligence, business automation and custom software.</p>
      </aside>
    </div>
  </section>

  <section className="section">
    <div className="container">

      <article className="service-block" id="ai-solutions">
        <div className="service-block-head">
          <span>01</span>
          <h2>Artificial Intelligence Solutions</h2>
        </div>
        <div className="service-block-grid">
          <div>
            <p className="lead">We develop AI-powered solutions that help businesses improve customer interactions, access information and automate everyday activities.</p>
            <ul className="check-list">
              <li>AI-powered customer assistants</li>
              <li>Intelligent chatbots</li>
              <li>AI customer support systems</li>
              <li>AI-powered business applications</li>
              <li>Custom AI integrations</li>
            </ul>
          </div>
          <div className="detail-panel">
            <dl>
              <div>
                <dt>Good fit if</dt>
                <dd>Your team answers the same customer questions daily, enquiries arrive faster than you can reply, or you want AI in the business but are unsure where it pays off.</dd>
              </div>
              <div>
                <dt>What you receive</dt>
                <dd>A scoped AI solution — assistant, support system or internal tool — integrated with your data, tested on real conversations and documented for your team.</dd>
              </div>
              <div>
                <dt>Typical timeline</dt>
                <dd>Two to six weeks from discovery to launch, depending on data access and integration points.</dd>
              </div>
            </dl>
          </div>
        </div>
      </article>

      <article className="service-block" id="automation">
        <div className="service-block-head">
          <span>02</span>
          <h2>Business Automation &amp; Integration</h2>
        </div>
        <div className="service-block-grid">
          <div>
            <p className="lead">We help businesses connect their tools, automate repetitive processes and improve operational efficiency.</p>
            <ul className="check-list">
              <li>WhatsApp business automation</li>
              <li>Automated customer enquiries</li>
              <li>Workflow automation</li>
              <li>Appointment and booking automation</li>
              <li>API and third-party integrations</li>
              <li>Automated notifications</li>
            </ul>
          </div>
          <div className="detail-panel">
            <dl>
              <div>
                <dt>Good fit if</dt>
                <dd>Enquiries, bookings and follow-ups are handled by hand, or information lives in tools that never talk to each other.</dd>
              </div>
              <div>
                <dt>What you receive</dt>
                <dd>Documented workflows, configured integrations — including WhatsApp — error handling and a plain-language runbook.</dd>
              </div>
              <div>
                <dt>Typical timeline</dt>
                <dd>One to four weeks per workflow, starting with the highest-value process first.</dd>
              </div>
            </dl>
          </div>
        </div>
      </article>

      <article className="service-block" id="software-development">
        <div className="service-block-head">
          <span>03</span>
          <h2>Custom Software Development</h2>
        </div>
        <div className="service-block-grid">
          <div>
            <p className="lead">We design and develop digital platforms that address specific business requirements.</p>
            <ul className="check-list">
              <li>Corporate websites</li>
              <li>E-commerce platforms</li>
              <li>Custom web applications</li>
              <li>Business management systems</li>
              <li>Customer dashboards</li>
              <li>Database and backend development</li>
            </ul>
          </div>
          <div className="detail-panel">
            <dl>
              <div>
                <dt>Good fit if</dt>
                <dd>You need a credible website, a store that can take orders, or an internal system your team will rely on daily.</dd>
              </div>
              <div>
                <dt>What you receive</dt>
                <dd>A responsive build with database and backend, admin access, documentation and a handover walkthrough.</dd>
              </div>
              <div>
                <dt>Typical timeline</dt>
                <dd>Three to eight weeks depending on scope and how much content is ready.</dd>
              </div>
            </dl>
          </div>
        </div>
      </article>

    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Engagement</p>
          <h2 className="section-title">How the work <span>runs.</span></h2>
        </div>
        <p className="lead">The same four stages apply to every service, so the process is predictable from the first conversation.</p>
      </div>
      <div className="steps reveal">
        <div className="step">
          <span>01</span>
          <h3>Discover</h3>
          <p>We talk through the goal, the current setup and the constraint that matters most.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>Define</h3>
          <p>You get a written scope: deliverables, timeline, cost and what is explicitly out of scope.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>Build</h3>
          <p>Work happens in visible stages with previews, so feedback arrives while it is still cheap to apply.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>Support</h3>
          <p>Handover includes documentation and training, with optional ongoing support afterwards.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">What you can expect</p>
          <h2 className="section-title">Standards applied to <span>every project.</span></h2>
        </div>
      </div>
      <div className="info-grid">
        <div className="info-card reveal">
          <span>01</span>
          <h3>Written scope</h3>
          <p>Deliverables, timeline and payment terms agreed in writing before work starts. No moving targets.</p>
        </div>
        <div className="info-card reveal">
          <span>02</span>
          <h3>Working previews</h3>
          <p>You review a live version of the build as it develops, not a surprise at the end.</p>
        </div>
        <div className="info-card reveal">
          <span>03</span>
          <h3>Clean handover</h3>
          <p>Files, accounts and access handed to you, with documentation and a walkthrough session.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Not sure which service you need?</h2>
          <p>Describe the goal or the problem. We will tell you what the work actually involves — even if the answer is that you do not need us yet.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn--primary" to="/start-a-project.html">Start a Project
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </Link>
          <a className="btn btn--ghost" href="https://wa.me/2349063924288" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>
    </>
  );
}
