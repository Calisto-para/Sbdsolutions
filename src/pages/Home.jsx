import { Link } from "react-router-dom";
import { SERVICES } from "../../shared/project-services";

const icon = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const ICONS = {
  assistant: icon(<><rect x="3" y="7" width="18" height="12" rx="3" /><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6" /></>),
  chatbot: icon(<><path d="M21 12a8 8 0 0 1-12 7L4 21l1.6-4.4A8 8 0 1 1 21 12Z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></>),
  whatsapp: icon(<><path d="M21 12a8 8 0 0 1-12 7L4 21l1.6-4.4A8 8 0 1 1 21 12Z" /><path d="M9 10c0 3 2.4 4.8 4.8 4.8" /></>),
  automation: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>),
  website: icon(<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M7 13h4" /><path d="M2 21h20" /></>),
  corporate: icon(<><path d="M4 21h16M6 21V8l6-4 6 4v13" /><path d="M10 12h4M10 16h4" /></>),
  ecommerce: icon(<><path d="M4 5h2l2.4 10.4A2 2 0 0 0 10.3 17h7.9a2 2 0 0 0 2-1.6L21.5 8H7" /><circle cx="10" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></>),
  software: icon(<><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /><path d="m13 5-3 14" /></>),
  systems: icon(<><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></>),
  booking: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /><path d="m9 16 2 2 4-4" /></>),
  platform: icon(<><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></>),
  shield: icon(<><path d="M12 3 5 6v6c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>),
  chart: icon(<><path d="M4 20V6M10 20V10M16 20v-6M22 20H2" /></>),
  chat: icon(<><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8" /></>),
};

const SERVICE_CARDS = [
  {
    name: "AI Customer Assistants",
    icon: ICONS.assistant,
    text: "A trained assistant that answers customer questions on your website, day and night, in your brand's voice.",
    to: "/services#ai-solutions",
  },
  {
    name: "AI Chatbot Development",
    icon: ICONS.chatbot,
    text: "Custom chatbots built around your services, pricing and FAQs — installed on your site with one script.",
    to: "/start-a-project?service=ai-chatbot-integration",
  },
  {
    name: "WhatsApp AI Automation",
    icon: ICONS.whatsapp,
    text: "Automated replies, enquiry capture and follow-ups on the channel your customers already use.",
    to: "/start-a-project?service=whatsapp-ai-automation",
  },
  {
    name: "Business Process Automation",
    icon: ICONS.automation,
    text: "Workflows, notifications and integrations that remove repetitive manual work from your team.",
    to: "/start-a-project?service=business-workflow-automation",
  },
  {
    name: "Business Website Development",
    icon: ICONS.website,
    text: "A credible company website that explains what you do and turns visitors into enquiries.",
    to: "/start-a-project?service=business-website",
  },
  {
    name: "Corporate Website Development",
    icon: ICONS.corporate,
    text: "A fuller corporate presence with the structure and credibility a growing organisation needs.",
    to: "/start-a-project?service=corporate-website",
  },
  {
    name: "E-commerce Development",
    icon: ICONS.ecommerce,
    text: "An online store with product management, checkout and the order handling behind it.",
    to: "/start-a-project?service=ecommerce-website",
  },
  {
    name: "Custom Software Development",
    icon: ICONS.software,
    text: "Web applications and internal tools built around how your business actually works.",
    to: "/start-a-project?service=custom-web-application",
  },
  {
    name: "Business Management Systems",
    icon: ICONS.systems,
    text: "Records, staff, stock, invoices and reporting in one system your team can rely on daily.",
    to: "/start-a-project?service=business-management-system",
  },
  {
    name: "Booking & Reservation Platforms",
    icon: ICONS.booking,
    text: "Availability, bookings, reminders and payment handling for service businesses.",
    to: "/start-a-project?service=booking-reservation-platform",
  },
];

const PRICE_ROWS = SERVICES.map((service) => ({
  slug: service.slug,
  name: service.name,
  usd: service.usd,
}));

const PROCESS = [
  {
    title: "You contact us",
    text: "Send an enquiry, message us on WhatsApp, or book a short call. Tell us the goal in plain language.",
  },
  {
    title: "We understand the requirement",
    text: "We ask the questions that matter — scope, users, data, deadlines — and confirm what success looks like.",
  },
  {
    title: "We recommend a solution",
    text: "You receive a written recommendation: the approach, the deliverables, the timeline and the cost.",
  },
  {
    title: "We build and implement",
    text: "Work happens in visible stages with previews, so feedback arrives while changes are still inexpensive.",
  },
  {
    title: "We support what we deliver",
    text: "Handover includes documentation and training, with optional ongoing support agreed in writing.",
  },
];

const usd = (value) => `$${Number(value || 0).toLocaleString("en-US")}`;

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy reveal">
            <p className="eyebrow">AI &amp; automation partner</p>
            <h1>
              Intelligent Technology.
              <br />
              <span>Smarter Business.</span>
            </h1>
            <p className="lead">
              SBD AI Solutions helps businesses grow with intelligent AI solutions, professional website
              development, custom software and business automation.
            </p>
            <div className="btn-row">
              <Link className="btn btn--primary" to="/services">
                Explore Our Services
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
              <Link className="btn btn--ghost" to="/register">
                Get Started
              </Link>
            </div>
            <ul className="hero-chips">
              <li>{ICONS.assistant} AI assistants</li>
              <li>{ICONS.software} Custom software</li>
              <li>{ICONS.automation} Automation</li>
            </ul>
          </div>

          <div className="hero-mock reveal" aria-hidden="true">
            <div className="mock-window">
              <div className="mock-bar">
                <span className="mock-dot" />
                <span className="mock-dot" />
                <span className="mock-dot" />
                <span className="mock-url">app.sbdaisolutions.com/dashboard</span>
              </div>
              <div className="mock-body">
                <div className="mock-rail">
                  <span className="mock-rail-logo" />
                  <span className="mock-rail-item is-active" />
                  <span className="mock-rail-item" />
                  <span className="mock-rail-item" />
                  <span className="mock-rail-item" />
                </div>
                <div className="mock-main">
                  <div className="mock-cards">
                    <div className="mock-card">
                      <span className="mock-label">AI assistants</span>
                      <span className="mock-value">Live</span>
                    </div>
                    <div className="mock-card">
                      <span className="mock-label">Conversations</span>
                      <span className="mock-value">Inbox</span>
                    </div>
                    <div className="mock-card">
                      <span className="mock-label">Leads</span>
                      <span className="mock-value">Captured</span>
                    </div>
                  </div>
                  <div className="mock-chart">
                    <span style={{ height: "38%" }} />
                    <span style={{ height: "62%" }} />
                    <span style={{ height: "48%" }} />
                    <span style={{ height: "76%" }} />
                    <span style={{ height: "58%" }} />
                    <span style={{ height: "88%" }} />
                    <span style={{ height: "70%" }} />
                  </div>
                  <div className="mock-list">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>

            <div className="mock-chat">
              <div className="mock-chat-head">
                <span className="mock-chat-avatar">AI</span>
                <div>
                  <strong>SBD AI Assistant</strong>
                  <em>online</em>
                </div>
              </div>
              <p className="mock-bubble">Hi! How can I help your business today?</p>
              <div className="mock-typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="services">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">What we do</p>
              <h2 className="section-title">
                Technology services built around <span>real business needs.</span>
              </h2>
            </div>
            <p className="lead">
              Ten focused service areas across artificial intelligence, automation and software development.
              Every engagement is scoped, quoted and delivered in writing.
            </p>
          </div>

          <div className="svc-grid">
            {SERVICE_CARDS.map((service) => (
              <article className="svc-card reveal" key={service.name}>
                <span className="svc-icon">{service.icon}</span>
                <h3>{service.name}</h3>
                <p>{service.text}</p>
                <Link className="svc-link" to={service.to}>
                  Request a Project
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--surface">
        <div className="container">
          <div className="platform-band reveal">
            <div className="platform-copy">
              <p className="eyebrow eyebrow--light">The SBD AI platform</p>
              <h2>Your own AI assistants, managed from one dashboard.</h2>
              <p>
                Register a business account, configure an assistant with your services and FAQs, install the website
                chatbot with a single script, then manage conversations, leads and usage as they come in.
              </p>
              <div className="btn-row">
                <Link className="btn btn--light" to="/register">
                  Explore the AI Platform
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </Link>
                <Link className="btn btn--ghost platform-ghost" to="/login">
                  Sign in
                </Link>
              </div>
            </div>
            <ul className="platform-list">
              <li>{ICONS.assistant} Configure assistants with your business knowledge</li>
              <li>{ICONS.shield} Keep conversations and visitor details in one place</li>
              <li>{ICONS.chat} Install the chatbot on any website</li>
              <li>{ICONS.chart} Monitor usage, credits and subscription limits</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="project-pricing">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">Project pricing</p>
              <h2 className="section-title">
                Clear starting prices. <span>No surprises.</span>
              </h2>
            </div>
            <p className="lead">
              These are development starting prices in US Dollars, with local currency shown at checkout. They are
              separate from the monthly AI platform subscription and are confirmed in a written quotation.
            </p>
          </div>

          <div className="price-strip reveal">
            {PRICE_ROWS.map((row) => (
              <Link className="price-row" key={row.slug} to={`/pricing#pricing`}>
                <span className="price-row-name">{row.name}</span>
                <span className="price-row-amount">
                  <strong>{usd(row.usd)}</strong>
                  <em>starting price</em>
                </span>
              </Link>
            ))}
          </div>

          <div className="price-strip-actions reveal">
            <Link className="btn btn--primary" to="/pricing">
              See full project pricing
            </Link>
            <Link className="btn btn--outline" to="/start-a-project">
              Request a quotation
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--surface">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">How we work</p>
              <h2 className="section-title">
                A clear process, from first call to <span>handover.</span>
              </h2>
            </div>
            <p className="lead">Five stages, every time. You always know what happens next.</p>
          </div>

          <ol className="process-rail">
            {PROCESS.map((step, index) => (
              <li className="process-step reveal" key={step.title}>
                <span className="process-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head reveal">
            <div>
              <p className="eyebrow">Our work</p>
              <h2 className="section-title">
                Real projects, <span>reported honestly.</span>
              </h2>
            </div>
            <p className="lead">
              We only publish work that exists. Nothing here is described as finished until it has been built and
              tested.
            </p>
          </div>

          <div className="work-grid">
            <article className="work-card reveal">
              <span className="work-tag">Prototype</span>
              <h3>UNSOCIALS</h3>
              <p>
                A social platform concept currently in development. Public features and screenshots will be published
                once the build is ready for demonstration.
              </p>
              <Link className="svc-link" to="/projects">
                View project status
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
            </article>
            <article className="work-card reveal">
              <span className="work-tag">In planning</span>
              <h3>SBD AI Assistant platform</h3>
              <p>
                The platform behind the website chatbot: assistants, training content, conversations and usage
                tracking. It is available to early customers and improved continuously.
              </p>
              <Link className="svc-link" to="/register">
                Open the platform
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section cta">
        <div className="container">
          <div className="cta-box reveal">
            <div>
              <h2>Let&apos;s Build Something Smarter.</h2>
              <p>
                Whether you need an AI solution, a professional website or custom business software, SBD AI Solutions
                can help turn your ideas into practical technology solutions.
              </p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn--light" to="/start-a-project">
                Start a Project
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
              <Link className="btn btn--ghost cta-ghost" to="/contact">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
