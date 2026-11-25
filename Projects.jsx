import { Link } from "react-router-dom";

export default function Projects() {
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>Projects</span></nav>
        <h1>Technology That Turns Ideas Into <span>Solutions.</span></h1>
        <p className="lead">Explore our technology projects, digital solutions and software development work. At SBD AI Solutions, we focus on building practical solutions that help businesses improve operations, simplify processes and embrace smarter technology.</p>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/start-a-project">Start a Project</Link>
          <Link className="btn btn--outline" to="/services">Explore services</Link>
        </div>
      </div>
      <aside className="page-tag">
        <strong>03</strong>
        <p>Project areas: artificial intelligence, business automation and web &amp; software development.</p>
      </aside>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Project areas</p>
          <h2 className="section-title">What we build and <span>deliver.</span></h2>
        </div>
        <p className="lead">Three areas of work, each delivered as a scoped project with a written definition of what is being built.</p>
      </div>

      <div className="card-grid">
        <div className="card reveal">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" /></svg></span>
          <h3>AI &amp; Artificial Intelligence</h3>
          <ul className="check-list">
            <li>AI customer assistants</li>
            <li>Intelligent chatbots</li>
            <li>AI-powered business applications</li>
          </ul>
        </div>
        <div className="card reveal">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg></span>
          <h3>Business Automation</h3>
          <ul className="check-list">
            <li>WhatsApp automation</li>
            <li>Workflow automation</li>
            <li>Automated customer management</li>
          </ul>
        </div>
        <div className="card reveal">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /><path d="m13 5-3 14" /></svg></span>
          <h3>Web &amp; Software Development</h3>
          <ul className="check-list">
            <li>Business websites</li>
            <li>E-commerce platforms</li>
            <li>Custom web applications</li>
            <li>Business management systems</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">In development</p>
          <h2 className="section-title">Products we are <span>building now.</span></h2>
        </div>
        <p className="lead">Work under construction is labelled honestly. Nothing here is described as finished until it is built and tested.</p>
      </div>

      <div className="duo-grid">
        <div className="info-card reveal">
          <span>PROTOTYPE</span>
          <h3>UNSOCIALS</h3>
          <p>A social platform concept currently in development. Public features, screenshots and usage details will be published once the build is ready for demonstration — not before.</p>
        </div>
        <div className="info-card reveal">
          <span>UPCOMING</span>
          <h3>SBD AI Assistant</h3>
          <p>An intelligent customer support assistant for business websites, currently in planning. It will be announced as a product only after it has been built and tested.</p>
        </div>
      </div>

      <p className="note">Completed client work is published here as projects finish and the client approves the details. If you would like to see relevant examples before starting a conversation, ask — and we will share the work that applies to your situation.</p>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="split">
        <div className="reveal">
          <p className="eyebrow">Delivery standards</p>
          <h2 className="section-title">The non-negotiables on every <span>build.</span></h2>
          <p className="lead" style={{ marginTop: "20px" }}>These are not upgrades. They are the baseline standard for anything delivered under the SBD AI Solutions name.</p>
        </div>
        <div className="reveal">
          <ul className="check-list">
            <li>Responsive layout tested across phone, tablet and desktop</li>
            <li>Performance treated as a requirement, not an afterthought</li>
            <li>Accessible structure, readable contrast and keyboard-friendly navigation</li>
            <li>Security basics: valid certificates, safe forms, controlled access</li>
            <li>Analytics and search setup so results can be measured</li>
            <li>Documentation and a handover walkthrough at the end of the project</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Have a project in mind?</h2>
          <p>Let's discuss how technology can help your business.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn--primary" to="/start-a-project">Start a Project
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
