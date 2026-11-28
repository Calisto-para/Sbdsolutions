import { Link } from "react-router-dom";

const icon = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const ICONS = {
  check: icon(<path d="m5 13 4 4 10-10" />),
  arrow: icon(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>),
  chat: icon(<><path d="M21 11.5a8 8 0 0 1-11.6 7.2L4 21l1.4-4.3A8 8 0 1 1 21 11.5Z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></>),
  whatsapp: icon(<><path d="M21 11.5a8 8 0 0 1-11.6 7.2L4 21l1.4-4.3A8 8 0 1 1 21 11.5Z" /><path d="M9 10c0 3 2.4 4.8 4.8 4.8" /></>),
  spark: icon(<><path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="2.6" /></>),
  globe: icon(<><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18" /></>),
  code: icon(<><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /><path d="m13.5 5-3 14" /></>),
  layers: icon(<><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" /></>),
  building: icon(<><path d="M4 21h16M6 21V7l6-4 6 4v14" /><path d="M10 11h4M10 15h4" /></>),
  cart: icon(<><path d="M4 5h2l2.4 10.4A2 2 0 0 0 10.3 17h7.9a2 2 0 0 0 2-1.6L21.5 8H7" /><circle cx="10" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></>),
  calendar: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>),
  plug: icon(<><path d="M9 3v5M15 3v5" /><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" /><path d="M12 17v4" /></>),
  shield: icon(<><path d="M12 3 5 6v6c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>),
  gauge: icon(<><path d="M4 18a9 9 0 1 1 16 0" /><path d="M12 14l4-4" /><circle cx="12" cy="14" r="1.6" /></>),
  users: icon(<><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.6M18 20c0-2.4-.8-4-2-5" /></>),
  mail: icon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  phone: icon(<path d="M7 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3Z" />),
};

const PRODUCTS = [
  {
    name: "SBD Website AI Chatbot",
    status: "Available now",
    tone: "live",
    icon: ICONS.chat,
    summary:
      "A trained AI assistant on your website that answers customer questions, captures enquiries and hands conversations to your team when a human is needed.",
    price: "$15",
    priceNote: "per month · Starter plan",
    points: [
      "Trained on your services, pricing and FAQs",
      "One script installs it on your website",
      "Lead capture and conversation history",
      "Human takeover and live team replies",
    ],
    primary: { label: "Get started", to: "/register" },
    secondary: { label: "See chatbot pricing", to: "/pricing" },
  },
  {
    name: "SBD WhatsApp AI Automation",
    status: "In development",
    tone: "soon",
    icon: ICONS.whatsapp,
    summary:
      "AI-assisted replies on WhatsApp, with an inbox for your team and a handover path when a conversation needs a person. It is being built on the official WhatsApp Business platform.",
    price: "Register interest",
    priceNote: "early access list",
    points: [
      "Automatic replies to common questions",
      "Human takeover from the same inbox",
      "Customer and conversation history",
      "Works alongside the website chatbot",
    ],
    primary: { label: "Register your interest", to: "/start-a-project?service=whatsapp-ai-automation" },
    secondary: { label: "Talk to us", to: "/contact" },
  },
];

const SERVICE_GROUPS = [
  {
    icon: ICONS.globe,
    title: "Websites & online stores",
    text: "Business websites, corporate sites and e-commerce builds that look credible and turn visitors into enquiries or orders.",
    items: ["Business & corporate websites", "E-commerce stores", "Landing pages"],
    to: "/services",
  },
  {
    icon: ICONS.code,
    title: "Web applications & custom software",
    text: "Software built around your actual workflow — dashboards, portals, internal tools and customer-facing applications.",
    items: ["Custom web applications", "Customer & staff portals", "API-backed platforms"],
    to: "/services",
  },
  {
    icon: ICONS.layers,
    title: "Business management systems",
    text: "One place for the records your team works with every day, instead of spreadsheets passed around by hand.",
    items: ["Customers & sales", "Inventory & invoicing", "Booking & scheduling"],
    to: "/services",
  },
  {
    icon: ICONS.chat,
    title: "AI chatbots & assistants",
    text: "Assistants trained on your own business information, installed on your website and managed from a dashboard.",
    items: ["Website AI chatbot", "Knowledge base & testing", "Human takeover"],
    to: "/services#ai-solutions",
  },
  {
    icon: ICONS.spark,
    title: "Automation & integrations",
    text: "Repetitive work removed from your team: follow-ups, routing, notifications and systems that talk to each other.",
    items: ["Workflow automation", "API integrations", "WhatsApp automation"],
    to: "/services#automation",
  },
  {
    icon: ICONS.shield,
    title: "Support & optimisation",
    text: "Ongoing maintenance, technical support and improvement of the AI and software you already depend on.",
    items: ["Maintenance & support", "AI response tuning", "Performance & security"],
    to: "/services",
  },
];

const PROBLEMS = [
  {
    title: "Enquiries arrive and nobody replies",
    text: "Visitors ask a question after hours and leave. An assistant answers immediately and records the lead.",
  },
  {
    title: "Your team repeats the same answers",
    text: "Opening hours, pricing, delivery, availability — the same questions handled by hand every day.",
  },
  {
    title: "Work lives in spreadsheets and chat threads",
    text: "Records get duplicated, lost or overwritten because there is no single system behind the work.",
  },
  {
    title: "The website does not match the business",
    text: "Customers judge credibility in seconds. An outdated site quietly costs enquiries you never see.",
  },
  {
    title: "Software that does not fit the workflow",
    text: "Off-the-shelf tools force your team to work around them. Custom software follows your process instead.",
  },
];

const SECTORS = [
  "Professional services",
  "Retail & e-commerce",
  "Real estate",
  "Hospitality",
  "Education & training",
  "Health & wellness",
  "Logistics",
  "Startups",
  "Agencies",
  "Financial services",
];

const STEPS = [
  {
    title: "Tell us the goal",
    text: "Send an enquiry, message us on WhatsApp or book a short call. Plain language is enough.",
  },
  {
    title: "We scope it in writing",
    text: "You get the recommended approach, deliverables, timeline and a fixed starting price.",
  },
  {
    title: "We build in visible stages",
    text: "You see previews while changes are still inexpensive, not only at the end.",
  },
  {
    title: "Launch, handover, support",
    text: "Deployment, documentation and training, with optional ongoing support agreed in writing.",
  },
];

const WHY = [
  {
    icon: ICONS.layers,
    title: "One team, end to end",
    text: "Website, software, AI and automation delivered together instead of coordinated between three suppliers.",
  },
  {
    icon: ICONS.shield,
    title: "Security taken seriously",
    text: "Server-side authorisation, verified payments, isolated customer data and no secrets in the browser.",
  },
  {
    icon: ICONS.gauge,
    title: "Written scope and pricing",
    text: "Starting prices published, quotes confirmed in writing, and no surprise line items after the work starts.",
  },
  {
    icon: ICONS.users,
    title: "Support after launch",
    text: "Documentation and training at handover, with maintenance available for the systems we build.",
  },
];

const FAQ = [
  {
    q: "How much does the website AI chatbot cost?",
    a: "Starter is $15 per month with 3,000 AI credits and one website, Professional is $35 with 10,000 credits and up to three websites, and Business is $65 with 25,000 credits and up to ten websites. Enterprise pricing is quoted for higher volumes. Project work such as a new website or custom software is quoted separately.",
  },
  {
    q: "Are AI replies unlimited?",
    a: "No. Each plan includes a monthly credit allowance that pays for AI usage. When the allowance is used up, the assistant pauses billable AI replies and you can upgrade or buy additional credits. Your conversations, leads and settings are kept either way.",
  },
  {
    q: "What is the difference between credits and unique customers?",
    a: "Credits measure AI usage — longer answers and more context cost more. Unique customers measure how many different people the assistant spoke to in the month, so one busy conversation does not count as many customers.",
  },
  {
    q: "Is the WhatsApp automation available today?",
    a: "Not yet. It is in development on the official WhatsApp Business platform. You can register your interest now and we will contact you when early access opens; we will not describe it as available before it can run.",
  },
  {
    q: "Can a human take over from the AI?",
    a: "Yes. The dashboard has a live inbox where you can take over a conversation, reply yourself, and return the conversation to the AI when you are done. The AI pauses while a person is in control.",
  },
  {
    q: "Do you work with businesses outside Nigeria?",
    a: "The platform is priced in US Dollars and can be used from anywhere. Project delivery and support are arranged around your time zone and confirmed in the written scope.",
  },
];

const Arrow = () => ICONS.arrow;

export default function Home() {
  return (
    <div className="hm">
      {/* Hero ------------------------------------------------------------ */}
      <section className="hm-hero">
        <div className="container hm-hero-grid">
          <div className="hm-hero-copy">
            <span className="hm-pill">
              <span className="hm-pill-dot" />
              Technology solutions company
            </span>
            <h1>
              We design, build and automate the technology your business runs on.
            </h1>
            <p className="hm-lead">
              SBD Solutions is a full-service technology partner: websites and online stores, custom
              software, business systems, AI chatbots and the automation that connects them.
            </p>
            <div className="hm-actions">
              <Link className="hm-btn hm-btn--primary" to="/start-a-project">
                Start a project <Arrow />
              </Link>
              <Link className="hm-btn hm-btn--ghost" to="/register">
                Explore the AI platform
              </Link>
            </div>
            <ul className="hm-trust">
              <li>{ICONS.check} Working software, not mock-ups</li>
              <li>{ICONS.check} Written scope and pricing</li>
              <li>{ICONS.check} Support after launch</li>
            </ul>
          </div>

          <div className="hm-stage" aria-hidden="true">
            <div className="hm-window">
              <div className="hm-window-bar">
                <span className="hm-dot" />
                <span className="hm-dot" />
                <span className="hm-dot" />
                <span className="hm-window-url">sbd solutions · platform</span>
              </div>
              <div className="hm-window-body">
                <div className="hm-rail">
                  <span className="hm-rail-logo">S</span>
                  <span className="hm-rail-item is-active" />
                  <span className="hm-rail-item" />
                  <span className="hm-rail-item" />
                  <span className="hm-rail-item" />
                </div>
                <div className="hm-panel">
                  <div className="hm-panel-head">
                    <strong>Conversations</strong>
                    <span className="hm-live">
                      <i /> Live
                    </span>
                  </div>
                  <div className="hm-msg hm-msg--visitor">Do you build online stores?</div>
                  <div className="hm-msg hm-msg--ai">
                    Yes — we design, build and support e-commerce sites, including payment setup and
                    order management. Would you like a quotation?
                  </div>
                  <div className="hm-msg hm-msg--visitor">Yes please.</div>
                  <div className="hm-ai-note">
                    <span className="hm-ai-dot" /> Lead captured · details sent to your team
                  </div>
                  <div className="hm-tiles">
                    <div className="hm-tile">
                      <span>Assistant</span>
                      <strong>Online</strong>
                    </div>
                    <div className="hm-tile">
                      <span>Handover</span>
                      <strong>Available</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="hm-float hm-float--chat">
              <span className="hm-float-avatar">{ICONS.chat}</span>
              <div>
                <strong>SBD Assistant</strong>
                <em>Answers instantly, day or night</em>
              </div>
            </div>

            <div className="hm-float hm-float--card">
              <span className="hm-float-icon">{ICONS.shield}</span>
              <div>
                <strong>Your data stays yours</strong>
                <em>Separate workspace per business</em>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capability strip ------------------------------------------------ */}
      <section className="hm-strip">
        <div className="container hm-strip-inner">
          <span>Websites</span>
          <span>E-commerce</span>
          <span>Custom software</span>
          <span>Business systems</span>
          <span>AI chatbots</span>
          <span>WhatsApp automation</span>
          <span>API integrations</span>
        </div>
      </section>

      {/* Products -------------------------------------------------------- */}
      <section className="hm-section" id="products">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Our products</p>
              <h2>Software you can subscribe to today.</h2>
            </div>
            <p className="hm-head-lead">
              Alongside project work, SBD Solutions runs its own products — starting with the website
              AI chatbot. Every product below states honestly what is available right now.
            </p>
          </div>

          <div className="hm-products">
            {PRODUCTS.map((product) => (
              <article className={`hm-product hm-product--${product.tone}`} key={product.name}>
                <div className="hm-product-top">
                  <span className="hm-product-icon">{product.icon}</span>
                  <span className={`hm-status hm-status--${product.tone}`}>{product.status}</span>
                </div>
                <h3>{product.name}</h3>
                <p className="hm-product-text">{product.summary}</p>
                <div className="hm-product-price">
                  <strong>{product.price}</strong>
                  <span>{product.priceNote}</span>
                </div>
                <ul className="hm-points">
                  {product.points.map((point) => (
                    <li key={point}>{ICONS.check} {point}</li>
                  ))}
                </ul>
                <div className="hm-product-actions">
                  <Link className="hm-btn hm-btn--primary hm-btn--sm" to={product.primary.to}>
                    {product.primary.label}
                  </Link>
                  <Link className="hm-link" to={product.secondary.to}>
                    {product.secondary.label} <Arrow />
                  </Link>
                </div>
              </article>
            ))}

            <article className="hm-product hm-product--custom">
              <span className="hm-product-icon hm-product-icon--ink">{ICONS.code}</span>
              <h3>Need something custom?</h3>
              <p className="hm-product-text">
                A portal, an internal system, an integration between tools you already pay for, or an
                AI assistant trained on your documents. Tell us the requirement and we will scope it.
              </p>
              <ul className="hm-points">
                <li>{ICONS.check} Scoped and quoted in writing</li>
                <li>{ICONS.check} Built in visible stages</li>
                <li>{ICONS.check} Delivered with documentation</li>
              </ul>
              <div className="hm-product-actions">
                <Link className="hm-btn hm-btn--dark hm-btn--sm" to="/start-a-project">
                  Request a quotation <Arrow />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Services -------------------------------------------------------- */}
      <section className="hm-section hm-section--tint" id="services">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">What we do</p>
              <h2>Complete digital solutions, delivered by one team.</h2>
            </div>
            <p className="hm-head-lead">
              Fourteen service areas across web, software, AI and automation — engaged individually or
              as one connected system.
            </p>
          </div>

          <div className="hm-services">
            {SERVICE_GROUPS.map((group) => (
              <article className="hm-service" key={group.title}>
                <span className="hm-service-icon">{group.icon}</span>
                <h3>{group.title}</h3>
                <p>{group.text}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link className="hm-link" to={group.to}>
                  Explore this service <Arrow />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Problems -------------------------------------------------------- */}
      <section className="hm-section">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Problems we solve</p>
              <h2>Technology should remove work, not add it.</h2>
            </div>
            <p className="hm-head-lead">
              These are the situations businesses bring to us most often. Each one has a practical,
              buildable answer.
            </p>
          </div>

          <div className="hm-problems">
            {PROBLEMS.map((problem, index) => (
              <article className="hm-problem" key={problem.title}>
                <span className="hm-problem-num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{problem.title}</h3>
                <p>{problem.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Sectors --------------------------------------------------------- */}
      <section className="hm-section hm-section--tint">
        <div className="container hm-sectors">
          <div>
            <p className="hm-eyebrow">Who we help</p>
            <h2>Businesses that depend on being reachable and organised.</h2>
            <p className="hm-head-lead">
              From a single founder to a multi-team operation. The scope changes; the standard does not.
            </p>
          </div>
          <ul className="hm-chips">
            {SECTORS.map((sector) => (
              <li key={sector}>{sector}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Process --------------------------------------------------------- */}
      <section className="hm-section">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">How we work</p>
              <h2>A clear process, from first message to handover.</h2>
            </div>
            <p className="hm-head-lead">
              Four stages, every time. You always know what is happening and what comes next.
            </p>
          </div>

          <ol className="hm-steps">
            {STEPS.map((step, index) => (
              <li className="hm-step" key={step.title}>
                <span className="hm-step-num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Work ------------------------------------------------------------ */}
      <section className="hm-section hm-section--tint">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Our work</p>
              <h2>Real projects, reported honestly.</h2>
            </div>
            <p className="hm-head-lead">
              We publish work that exists. Nothing is described as finished until it has been built
              and tested — including our own platform.
            </p>
          </div>

          <div className="hm-work">
            <article className="hm-work-card">
              <span className="hm-work-tag">Platform</span>
              <h3>SBD Solutions AI platform</h3>
              <p>
                The product behind the website chatbot: assistants, training material, live
                conversations, human takeover, leads and usage tracking — in production and improved
                continuously.
              </p>
              <Link className="hm-link" to="/register">
                Open the platform <Arrow />
              </Link>
            </article>
            <article className="hm-work-card">
              <span className="hm-work-tag hm-work-tag--soft">In development</span>
              <h3>UNSOCIALS</h3>
              <p>
                A social platform concept in active development. Public features and screenshots will
                be published once the build is ready for demonstration.
              </p>
              <Link className="hm-link" to="/projects">
                View project status <Arrow />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* Why us ---------------------------------------------------------- */}
      <section className="hm-section">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Why SBD Solutions</p>
              <h2>A technology partner that stays accountable after launch.</h2>
            </div>
          </div>
          <div className="hm-why">
            {WHY.map((item) => (
              <article className="hm-why-card" key={item.title}>
                <span className="hm-why-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ ------------------------------------------------------------- */}
      <section className="hm-section hm-section--tint">
        <div className="container hm-faq-wrap">
          <div className="hm-faq-intro">
            <p className="hm-eyebrow">Questions</p>
            <h2>Straight answers before you commit.</h2>
            <p className="hm-head-lead">
              Something not covered here? Send an enquiry and we will answer it directly.
            </p>
            <Link className="hm-btn hm-btn--ghost" to="/contact">
              Contact us
            </Link>
          </div>

          <div className="hm-faq">
            {FAQ.map((item) => (
              <details className="hm-faq-item" key={item.q}>
                <summary>
                  <span>{item.q}</span>
                  <i aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / CTA ---------------------------------------------------- */}
      <section className="hm-section hm-section--cta" id="contact">
        <div className="container">
          <div className="hm-cta">
            <div className="hm-cta-copy">
              <p className="hm-eyebrow hm-eyebrow--light">Let&apos;s build</p>
              <h2>Tell us what the business needs to do better.</h2>
              <p>
                A new website, a system your team actually uses, or AI that answers customers properly.
                Send the requirement and we will reply with a clear recommendation.
              </p>
            </div>
            <div className="hm-cta-actions">
              <Link className="hm-btn hm-btn--light" to="/start-a-project">
                Start a project <Arrow />
              </Link>
              <a className="hm-btn hm-btn--outline-light" href="mailto:sbdiam.solutions@gmail.com">
                {ICONS.mail} Email us
              </a>
              <a
                className="hm-btn hm-btn--outline-light"
                href="https://wa.me/2349063924288"
                target="_blank"
                rel="noopener"
              >
                {ICONS.whatsapp} WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
