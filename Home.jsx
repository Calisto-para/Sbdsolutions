import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
<section className="hero">
    <div className="container hero-inner">
      <div className="hero-copy reveal">
        <p className="eyebrow">AI &amp; automation partner</p>
        <h1>Intelligent Technology.<br /><span>Smarter Business.</span></h1>
        <p className="lead">SBD AI Solutions is a technology company helping businesses transform their operations through artificial intelligence, intelligent automation and custom software solutions. We build digital tools that simplify business processes, improve customer experiences and support business growth.</p>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/services">Explore Our Solutions
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </Link>
          <Link className="btn btn--ghost" to="/start-a-project">Start a Project</Link>
        </div>
      </div>
    </div>
    <div className="hero-visual" aria-hidden="true">
      <img src="/assets/sbd-ai-robot.png" alt="" width="755" height="400" />
    </div>
    <div className="container">
      <div className="hero-highlights reveal">
        <div className="highlight">
          <span className="highlight-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" /></svg></span>
          <div>
            <h3>AI &amp; Business Automation</h3>
            <p>Work smarter with intelligent solutions</p>
          </div>
        </div>
        <div className="highlight">
          <span className="highlight-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /><path d="m13 5-3 14" /></svg></span>
          <div>
            <h3>Custom Software Development</h3>
            <p>Build solutions for your unique needs</p>
          </div>
        </div>
        <div className="highlight">
          <span className="highlight-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 17h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 3.5 3.5 0 0 0 7 17Z" /><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" /></svg></span>
          <div>
            <h3>Intelligent Digital Solutions</h3>
            <p>Innovate. Automate. Grow.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section className="section">
    <div className="container why-grid">
      <div className="reveal">
        <h2 className="section-title">Why Choose <span>SBD AI Solutions?</span></h2>
        <p className="lead" style={{ marginTop: "14px" }}>We combine innovation, expertise and a customer-first approach to deliver technology solutions that make a difference.</p>
        <div className="why-list">
          <div className="why-item">
            <span className="why-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7V16h5.6v-.5c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z" /></svg></span>
            <div>
              <h3>Practical Innovation</h3>
              <p>Real solutions for real business needs.</p>
            </div>
          </div>
          <div className="why-item">
            <span className="why-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg></span>
            <div>
              <h3>Intelligent Automation</h3>
              <p>Reduce repetitive work and boost efficiency.</p>
            </div>
          </div>
          <div className="why-item">
            <span className="why-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></svg></span>
            <div>
              <h3>Custom Development</h3>
              <p>Technology built around your business.</p>
            </div>
          </div>
          <div className="why-item">
            <span className="why-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 20h18" /><path d="M6 20v-6M11 20V9M16 20v-9M21 20V5" /></svg></span>
            <div>
              <h3>Continuous Improvement</h3>
              <p>Always evolving for your success.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="why-media reveal">
        <img src="/assets/sbd-office-building.png" alt="The SBD AI Solutions office building" width="595" height="190" />
      </div>
    </div>
  </section>
  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">What we do</p>
          <h2 className="section-title">Services built around <span>real business needs.</span></h2>
        </div>
        <p className="lead">Three connected service areas covering intelligent tools, automated operations and the software that ties them together.</p>
      </div>

      <div className="card-grid">
        <Link className="card reveal" to="/services#ai-solutions">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" /></svg></span>
          <h3>Artificial Intelligence Solutions</h3>
          <p>AI customer assistants, intelligent chatbots, AI support systems and custom integrations that handle real conversations.</p>
          <span className="card-arrow">Learn more</span>
        </Link>
        <Link className="card reveal" to="/services#automation">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg></span>
          <h3>Business Automation &amp; Integration</h3>
          <p>WhatsApp automation, automated enquiries, workflow and booking automation, and the integrations that connect your tools.</p>
          <span className="card-arrow">Learn more</span>
        </Link>
        <Link className="card reveal" to="/services#software-development">
          <span className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /><path d="m13 5-3 14" /></svg></span>
          <h3>Custom Software Development</h3>
          <p>Corporate websites, e-commerce platforms, custom web applications, dashboards and the databases behind them.</p>
          <span className="card-arrow">Learn more</span>
        </Link>
      </div>
    </div>
  </section>


  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">How we work</p>
          <h2 className="section-title">A clear process from first call to <span>handover.</span></h2>
        </div>
        <p className="lead">No guesswork, no disappearing acts. Every engagement follows the same four stages.</p>
      </div>

      <div className="steps reveal">
        <div className="step">
          <span>01</span>
          <h3>Discover</h3>
          <p>A short conversation about the goal, the constraint and what a successful outcome looks like.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>Define</h3>
          <p>Scope, timeline and cost written down, so everyone knows exactly what is being built.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>Build</h3>
          <p>Regular progress updates and working previews — you see the product take shape, not just a final bill.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>Support</h3>
          <p>A clean handover with documentation, plus the option to extend and improve later.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Have a project in mind?</h2>
          <p>Tell us what you want to build, improve or automate. We will come back with a clear view of the options and the next step.</p>
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
