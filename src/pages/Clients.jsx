import { Link } from "react-router-dom";

export default function Clients() {
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>Who We Help</span></nav>
        <h1>Technology Solutions for Businesses Ready to <span>Grow.</span></h1>
        <p className="lead">We work with businesses, startups and organizations looking to improve their operations through digital technology, automation and intelligent software solutions.</p>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/start-a-project.html">Discuss Your Business Needs</Link>
          <Link className="btn btn--outline" to="/services.html">Explore services</Link>
        </div>
      </div>
      <aside className="page-tag">
        <strong>04</strong>
        <p>Four client types, one practical method: understand the need, then build what serves it.</p>
      </aside>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Who we serve</p>
          <h2 className="section-title">Four starting points, one <span>standard.</span></h2>
        </div>
        <p className="lead">The entry point differs; the approach does not.</p>
      </div>

      <div className="audience reveal">
        <div className="audience-row" id="businesses">
          <span>01</span>
          <div>
            <h3>Businesses</h3>
            <p>Companies seeking better customer experiences, automation and digital operations.</p>
          </div>
          <div className="audience-needs">
            <b>Typical work</b>
            AI assistants · Workflow automation · Business platforms
          </div>
        </div>
        <div className="audience-row" id="startups">
          <span>02</span>
          <div>
            <h3>Startups</h3>
            <p>Founders building digital products, platforms and innovative business ideas.</p>
          </div>
          <div className="audience-needs">
            <b>Typical work</b>
            Web applications · Product platforms · Digital foundations
          </div>
        </div>
        <div className="audience-row" id="organizations">
          <span>03</span>
          <div>
            <h3>Organizations</h3>
            <p>Organizations looking to improve internal processes and connect their technology systems.</p>
          </div>
          <div className="audience-needs">
            <b>Typical work</b>
            Integrations · Internal tools · Process automation
          </div>
        </div>
        <div className="audience-row" id="online-businesses">
          <span>04</span>
          <div>
            <h3>Online Businesses</h3>
            <p>E-commerce businesses and digital entrepreneurs looking to improve their online operations.</p>
          </div>
          <div className="audience-needs">
            <b>Typical work</b>
            E-commerce platforms · WhatsApp automation · Customer support
          </div>
        </div>
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Industries</p>
          <h2 className="section-title">Industries We Can <span>Support</span></h2>
        </div>
        <p className="lead">Sectors where the same problems tend to appear: repetitive enquiries, disconnected tools and manual processes.</p>
      </div>

      <div className="tag-grid reveal">
        <span className="tag">Retail and e-commerce</span>
        <span className="tag">Real estate</span>
        <span className="tag">Automotive</span>
        <span className="tag">Hospitality</span>
        <span className="tag">Professional services</span>
        <span className="tag">Education</span>
        <span className="tag">Logistics</span>
      </div>

      <p className="note">These are target markets we build for — not claims of existing clients or prior industry experience. Completed work is published on the Projects page as it is approved.</p>
    </div>
  </section>

  <section className="section">
    <div className="container split">
      <div className="reveal">
        <p className="eyebrow">Working together</p>
        <h2 className="section-title">You bring the problem. We bring the <span>path.</span></h2>
      </div>
      <div className="reveal">
        <p className="lead">Whatever stage your business is in, we can help identify technology solutions that support your objectives. You do not need to know the technology before the first conversation — only what needs to work better.</p>
        <p className="lead">If your requirement falls outside what we build, you will hear that directly rather than after a proposal.</p>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/start-a-project.html">Discuss Your Business Needs
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Have a goal in mind?</h2>
          <p>Tell us what you are trying to build, improve or automate. We will help you find the shortest sensible path to it.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn--primary" to="/start-a-project.html">Start a Project</Link>
          <a className="btn btn--ghost" href="https://wa.me/2349063924288" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>
    </>
  );
}
