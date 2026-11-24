import { Link } from "react-router-dom";

export default function About() {
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>About Us</span></nav>
        <h1>About <span>SBD AI Solutions</span></h1>
        <p className="lead">SBD AI Solutions is a technology company focused on helping businesses operate smarter through artificial intelligence, automation and custom software development.</p>
      </div>
      <aside className="page-tag">
        <strong>Our purpose</strong>
        <p>We combine technology, innovation and practical problem-solving to build solutions that make business simpler.</p>
      </aside>
    </div>
  </section>

  <section className="section">
    <div className="container split">
      <div className="reveal">
        <p className="eyebrow">Who we are</p>
        <h2 className="section-title">Technology with a practical <span>purpose.</span></h2>
      </div>
      <div className="reveal">
        <p className="lead">We combine technology, innovation and practical problem-solving to develop digital solutions that simplify business operations, improve customer experiences and support business growth.</p>
        <p className="lead">Our work sits where artificial intelligence, automation and software meet: intelligent assistants that answer customers, workflows that run without supervision, and platforms built for a specific business requirement rather than a generic template.</p>
        <p className="lead">Every engagement starts with the problem, not the product. We define what needs to work better, choose the simplest solution that serves it, and deliver it with a written scope and a clean handover.</p>
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Direction</p>
          <h2 className="section-title">Our mission and <span>vision.</span></h2>
        </div>
        <p className="lead">Two statements that decide which work we take on and how we deliver it.</p>
      </div>

      <div className="duo-grid">
        <div className="info-card reveal">
          <span>OUR MISSION</span>
          <h3>Accessible, intelligent technology</h3>
          <p>To empower businesses with accessible, innovative and intelligent technology solutions that improve efficiency, simplify operations and create better digital experiences.</p>
        </div>
        <div className="info-card reveal">
          <span>OUR VISION</span>
          <h3>A trusted technology company</h3>
          <p>To become a trusted technology company recognized for developing innovative AI-powered solutions and transforming how businesses operate in an increasingly digital world.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Our core values</p>
          <h2 className="section-title">The standards behind the <span>work.</span></h2>
        </div>
        <p className="lead">Five values that shape how projects are scoped, built and handed over.</p>
      </div>

      <div className="info-grid">
        <div className="info-card reveal">
          <span>01</span>
          <h3>Innovation</h3>
          <p>Embracing technology and exploring better ways to solve business challenges.</p>
        </div>
        <div className="info-card reveal">
          <span>02</span>
          <h3>Integrity</h3>
          <p>Maintaining transparency, honesty and responsibility.</p>
        </div>
        <div className="info-card reveal">
          <span>03</span>
          <h3>Excellence</h3>
          <p>Delivering reliable, practical and high-quality solutions.</p>
        </div>
        <div className="info-card reveal">
          <span>04</span>
          <h3>Customer Focus</h3>
          <p>Putting customer needs at the center of our development process.</p>
        </div>
        <div className="info-card reveal">
          <span>05</span>
          <h3>Continuous Improvement</h3>
          <p>Continuously improving our technology and services.</p>
        </div>
        <div className="info-card reveal">
          <span>06</span>
          <h3>Long-term Partnership</h3>
          <p>Staying useful after launch, so the solution grows with the business.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">Our approach</p>
          <h2 className="section-title">Four stages, every <span>project.</span></h2>
        </div>
        <p className="lead">A predictable process keeps projects calm and keeps decisions with the person who owns the business.</p>
      </div>
      <div className="steps reveal">
        <div className="step">
          <span>01</span>
          <h3>Understand</h3>
          <p>Learn about the client's needs, the current setup and the constraint that matters most.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>Strategize</h3>
          <p>Identify the appropriate solution and agree the scope, timeline and cost in writing.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>Develop</h3>
          <p>Design and build the solution in visible stages, with previews you can review as it happens.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>Deliver</h3>
          <p>Test, deploy and provide support, with documentation and a walkthrough at handover.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section">
    <div className="container">
      <div className="split">
        <div className="reveal">
          <p className="eyebrow">In short</p>
          <h2 className="section-title">We don't just build digital <span>products.</span></h2>
        </div>
        <div className="reveal">
          <p className="lead">We create technology solutions that help businesses move forward.</p>
          <div className="btn-row" style={{ marginTop: "28px" }}>
            <Link className="btn btn--primary" to="/start-a-project">Work With Us
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </Link>
            <Link className="btn btn--outline" to="/services">Explore services</Link>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Let's talk about what you need.</h2>
          <p>Whether it is a new platform, a process that needs automating or a decision you want a second opinion on, start with a conversation.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn--primary" to="/start-a-project">Start a Project</Link>
          <Link className="btn btn--ghost" to="/contact">Contact us</Link>
        </div>
      </div>
    </div>
  </section>
    </>
  );
}
