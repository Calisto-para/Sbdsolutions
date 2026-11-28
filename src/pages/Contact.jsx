import { Link } from "react-router-dom";

export default function Contact() {
  return (
    <>
<section className="page-hero">
    <div className="container page-hero-grid">
      <div>
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><span>Contact</span></nav>
        <h1>Let's Build Something <span>Intelligent.</span></h1>
        <p className="lead">Have a business challenge, technology idea or project in mind? Get in touch with SBD Solutions. Let's explore how artificial intelligence, automation and custom software can help you achieve your objectives.</p>
      </div>
      <aside className="page-tag">
        <strong>Direct contact</strong>
        <p>Call, message or email. Enquiries are answered personally, not routed through a queue.</p>
      </aside>
    </div>
  </section>

  <section className="section" id="contact">
    <div className="container contact-grid">
      <div>
        <p className="eyebrow">Get in touch</p>
        <h2 className="section-title">Three ways to reach <span>us.</span></h2>
        <p className="lead">Use whichever suits you. WhatsApp is fastest for a quick question; email is best for detailed requirements.</p>

        <div className="contact-channels">
          <a className="channel" href="https://wa.me/2349063924288" target="_blank" rel="noopener">
            <span className="channel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M21 12a8 8 0 0 1-12 7L4 21l1.6-4.4A8 8 0 1 1 21 12Z" /><path d="M9 10c0 3 2.4 4.8 4.8 4.8" /></svg></span>
            <div>
              <span>WhatsApp</span>
              <strong>+234 906 392 4288</strong>
            </div>
          </a>
          <a className="channel" href="tel:+2348122104576">
            <span className="channel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3Z" /></svg></span>
            <div>
              <span>Phone</span>
              <strong>+234 812 210 4576</strong>
            </div>
          </a>
          <a className="channel" href="mailto:sbdiam.solutions@gmail.com">
            <span className="channel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
            <div>
              <span>Email</span>
              <strong>sbdiam.solutions@<wbr />gmail.com</strong>
            </div>
          </a>
        </div>
      </div>

      <div className="form-card">
        <h2>Have a detailed brief?</h2>
        <p>Project details — service required, budget and requirements — go through the project enquiry form. It reaches us directly and gives us what we need to reply usefully.</p>
        <Link className="btn btn--primary" to="/start-a-project">Start a Project
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        </Link>
        <p className="form-note">For everything else, message us on WhatsApp or send an email. We read both.</p>
      </div>
    </div>
  </section>

  <section className="section section--surface">
    <div className="container">
      <div className="section-head reveal">
        <div>
          <p className="eyebrow">What happens next</p>
          <h2 className="section-title">A simple, honest <span>start.</span></h2>
        </div>
        <p className="lead">No pressure and no obligation — the first conversation is about understanding the need.</p>
      </div>
      <div className="steps steps--five reveal">
        <div className="step">
          <span>01</span>
          <h3>You contact us</h3>
          <p>Send a message, an email or a project enquiry with the basics.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>We understand</h3>
          <p>A short conversation about the requirement, current setup and constraint.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>We propose</h3>
          <p>You receive a proposed solution with the recommended approach and why.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>We agree</h3>
          <p>Scope and pricing confirmed in writing before any work begins.</p>
        </div>
        <div className="step">
          <span>05</span>
          <h3>Development begins</h3>
          <p>Work starts with agreed milestones and visible progress.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="section">
    <div className="container split">
      <div className="reveal">
        <p className="eyebrow">Questions</p>
        <h2 className="section-title">Before you <span>ask.</span></h2>
        <p className="lead" style={{ marginTop: "20px" }}>Still unsure about something? Send the question directly — it is a faster route than guessing.</p>
      </div>
      <div className="faq reveal">
        <details>
          <summary>How much does a project cost?</summary>
          <p>Cost depends on scope. A single-page website and a full business platform are very different pieces of work, so every project is quoted after a short conversation rather than from a fixed price list. You will always see the cost before anything begins.</p>
        </details>
        <details>
          <summary>How long does a project take?</summary>
          <p>Websites typically take two to six weeks. AI assistants and automations usually take one to four weeks per workflow. Larger platforms are broken into stages with a timeline agreed upfront.</p>
        </details>
        <details>
          <summary>Do you work with clients outside Nigeria?</summary>
          <p>Yes. Video calls, email and WhatsApp cover the working relationship. Time zones are agreed at the start so review points are predictable.</p>
        </details>
        <details>
          <summary>What happens after the project is finished?</summary>
          <p>Every project ends with a documented handover and a walkthrough. Ongoing maintenance and improvements are optional, on a monthly basis or as needed.</p>
        </details>
      </div>
    </div>
  </section>

  <section className="section cta">
    <div className="container">
      <div className="cta-box reveal">
        <div>
          <h2>Prefer to start with the details?</h2>
          <p>Send your requirements through the project enquiry form and we will come back with the next steps.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn--primary" to="/start-a-project">Start a Project</Link>
          <a className="btn btn--ghost" href="https://wa.me/2349063924288" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>
    </>
  );
}
