import { Link } from "react-router-dom";

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
  { name: "Starter", price: "$15", credits: "3,000", websites: "1 website", note: "For a single business website" },
  { name: "Professional", price: "$35", credits: "10,000", websites: "Up to 3 websites", note: "For growing teams", featured: true },
  { name: "Business", price: "$65", credits: "25,000", websites: "Up to 10 websites", note: "For multi-site operations" },
  { name: "Enterprise", price: "Custom", credits: "Custom", websites: "Custom", note: "Higher volume and custom terms" },
];

const WHATSAPP_PLANS = [
  { name: "Basic", price: "$7", customers: "50", replies: "1,000" },
  { name: "Starter", price: "$29", customers: "500", replies: "2,500" },
  { name: "Professional", price: "$59", customers: "1,000", replies: "5,000", featured: true },
  { name: "Business", price: "$79", customers: "2,000", replies: "10,000" },
  { name: "Enterprise", price: "Custom", customers: "Custom", replies: "Custom" },
];

const CHATBOT_FEATURES = [
  {
    title: "Trained on your business",
    text: "Add services, prices, FAQs, policies and documents. The assistant answers from that material, not from guesses.",
  },
  {
    title: "One-script installation",
    text: "Paste a single script into your website and the chat bubble appears, styled to sit quietly on the page.",
  },
  {
    title: "Lead capture",
    text: "When a visitor shows interest, the assistant can collect name, email and phone and save the lead in your dashboard.",
  },
  {
    title: "Human takeover",
    text: "Step into any conversation from the live inbox, reply yourself, then hand it back to the AI when you are done.",
  },
  {
    title: "Usage you can see",
    text: "Credits, conversations and unique customers are tracked per billing period, with warnings before a limit is reached.",
  },
  {
    title: "Test before launch",
    text: "Ask the assistant questions against your own knowledge base from the dashboard before customers ever see it.",
  },
];

const CHATBOT_STEPS = [
  { title: "Choose a plan", text: "Start with the credit and website allowance that matches your traffic." },
  { title: "Add your knowledge", text: "Business description, services, pricing and the questions customers actually ask." },
  { title: "Install the widget", text: "Copy the script into your site. It works with plain HTML and common site builders." },
  { title: "Answer and hand over", text: "The AI handles routine questions; your team takes the conversations that need a person." },
];

const FAQ = [
  {
    q: "What is a credit?",
    a: "A credit is the unit that pays for AI usage. Longer answers with more context use more credits. The dashboard shows credits used and remaining for the current billing period.",
  },
  {
    q: "What counts as a unique customer?",
    a: "Each different visitor the assistant speaks to in a billing period counts once, however many messages they send. Unique customers are tracked separately from credits.",
  },
  {
    q: "What happens when credits run out?",
    a: "Billable AI replies pause, and you are prompted to upgrade or purchase additional credits. Your conversations, leads and settings stay intact and the dashboard remains available.",
  },
  {
    q: "Can I put the chatbot on more than one website?",
    a: "Yes, up to the website allowance on your plan. Each installation uses the same trained assistant and reports into the same inbox.",
  },
  {
    q: "Is the WhatsApp product live?",
    a: "No. It is in development on the official WhatsApp Business platform. You can register interest now, and pricing is published in advance — no WhatsApp subscription is charged today.",
  },
  {
    q: "Do I pay Meta separately for WhatsApp messages?",
    a: "No. Within your subscribed plan allowance, applicable WhatsApp messaging charges are covered by SBD Solutions — no separate Meta messaging payment is required from you. Usage beyond the plan may need an upgrade or an approved custom arrangement, agreed before it is billed.",
  },
];

export default function Products() {
  return (
    <div className="hm">
      <section className="hm-hero">
        <div className="container hm-hero-grid">
          <div className="hm-hero-copy">
            <span className="hm-pill">
              <span className="hm-pill-dot" /> SBD products
            </span>
            <h1>Software that answers customers, on the channels they already use.</h1>
            <p className="hm-lead">
              Two products, built on the same platform: a website AI chatbot available today, and WhatsApp AI
              automation in development. Each is priced openly, with the limits stated up front.
            </p>
            <div className="hm-actions">
              <a className="hm-btn hm-btn--primary" href="#website-chatbot">
                Website chatbot {arrow}
              </a>
              <a className="hm-btn hm-btn--ghost" href="#whatsapp">
                WhatsApp automation
              </a>
            </div>
            <ul className="hm-trust">
              <li>{check} No unlimited-AI claims</li>
              <li>{check} Human takeover included</li>
              <li>{check} Cancel from the dashboard</li>
            </ul>
          </div>
          <div className="hm-product-side">
            <article className="hm-side-card">
              <span className="hm-status hm-status--live">Available now</span>
              <h3>Website AI Chatbot</h3>
              <p>From $15 per month · 3,000 credits · 1 website</p>
              <Link className="hm-link" to="/register">Open the platform {arrow}</Link>
            </article>
            <article className="hm-side-card hm-side-card--soon">
              <span className="hm-status hm-status--soon">In development</span>
              <h3>WhatsApp AI Automation</h3>
              <p>Early access list open · pricing published, not yet billed</p>
              <Link className="hm-link" to="/start-a-project?service=whatsapp-ai-automation">
                Register interest {arrow}
              </Link>
            </article>
            <article className="hm-side-card hm-side-card--demo">
              <h3>Try the assistant now</h3>
              <p>The chat bubble in the corner of this page is the real product. Ask it about SBD Solutions.</p>
              <span className="hm-side-hint">Look for the bubble at the bottom-right of the screen.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="hm-section" id="website-chatbot">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Product 01</p>
              <h2>SBD Website AI Chatbot</h2>
              <p className="hm-product-sub">
                <span className="hm-status hm-status--live">Available now</span>
                <span>Billed monthly in US Dollars through the dashboard.</span>
              </p>
            </div>
            <p className="hm-head-lead">
              An assistant trained on your own business information, installed on your website, with a live inbox for
              your team and usage limits that are visible rather than hidden.
            </p>
          </div>

          <div className="hm-feature-grid">
            {CHATBOT_FEATURES.map((feature) => (
              <article className="hm-feature" key={feature.title}>
                <span className="hm-feature-check">{check}</span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="hm-block">
            <h3 className="hm-block-title">How it works</h3>
            <ol className="hm-steps">
              {CHATBOT_STEPS.map((step, index) => (
                <li className="hm-step" key={step.title}>
                  <span className="hm-step-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="hm-block">
            <h3 className="hm-block-title">Plans and allowances</h3>
            <div className="hm-table-wrap">
              <table className="hm-table">
                <caption className="hm-visually-hidden">Website AI Chatbot pricing plans</caption>
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Monthly price</th>
                    <th scope="col">AI credits / month</th>
                    <th scope="col">Website allowance</th>
                    <th scope="col">Best for</th>
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
                      <td data-label="Best for">{plan.note || "Custom volume and terms"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hm-note">
              Credits pay for AI usage; unique customers are counted separately and are not limited by these plans.
              Repeated answers to the same visitor do not create a new customer. Prices in US Dollars.
            </p>
            <div className="hm-actions">
              <Link className="hm-btn hm-btn--primary" to="/register">Get started {arrow}</Link>
              <Link className="hm-btn hm-btn--ghost" to="/pricing#chatbot">Compare plans</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="hm-section hm-section--tint" id="whatsapp">
        <div className="container">
          <div className="hm-head">
            <div>
              <p className="hm-eyebrow">Product 02</p>
              <h2>SBD WhatsApp AI Automation</h2>
              <p className="hm-product-sub">
                <span className="hm-status hm-status--soon">In development</span>
                <span>Early access · not yet billable</span>
              </p>
            </div>
            <p className="hm-head-lead">
              AI-assisted replies on WhatsApp with the same inbox and human takeover as the website chatbot. It is
              being built on the official WhatsApp Business platform and is not connected to any live number yet.
            </p>
          </div>

          <div className="hm-two-col">
            <article className="hm-panel-card">
              <h3>What it will do</h3>
              <ul className="hm-points">
                <li>{check} Answer common questions automatically, using the same trained business knowledge</li>
                <li>{check} Capture enquiries and customer details into the SBD inbox</li>
                <li>{check} Pause AI and let a person reply, then hand back</li>
                <li>{check} Keep WhatsApp and website conversations in one organised workspace</li>
              </ul>
            </article>
            <article className="hm-panel-card hm-panel-card--warn">
              <h3>What is needed before it can run</h3>
              <ul className="hm-points hm-points--plain">
                <li>Meta Business verification and a WhatsApp Business Account</li>
                <li>A dedicated phone number and permanent system-user access token</li>
                <li>Approved message templates for conversations started outside a 24-hour window</li>
                <li>A phone number you control, verified in your business name</li>
              </ul>
              <p className="hm-note hm-note--tight">
                We will not describe the channel as connected until a real number is authorised and tested.
              </p>
            </article>
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

          <div className="hm-block">
            <h3 className="hm-block-title">Published early-access pricing</h3>
            <div className="hm-table-wrap">
              <table className="hm-table">
                <caption className="hm-visually-hidden">WhatsApp AI Automation planned pricing</caption>
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
            <p className="hm-note">
              These prices are published in advance so you can plan. No WhatsApp subscription exists to charge today;
              early-access customers will be contacted before any billing begins. A unique customer is a different
              WhatsApp contact in the month; an AI reply is one automated response. Applicable WhatsApp messaging
              charges are covered within the plan allowance — there is no separate Meta invoice for covered usage.
            </p>
            <div className="hm-actions">
              <Link className="hm-btn hm-btn--primary" to="/start-a-project?service=whatsapp-ai-automation">
                Register your interest {arrow}
              </Link>
              <Link className="hm-btn hm-btn--ghost" to="/contact">Ask a question</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="hm-section">
        <div className="container hm-faq-wrap">
          <div className="hm-faq-intro">
            <p className="hm-eyebrow">Product questions</p>
            <h2>What customers ask before subscribing.</h2>
            <p className="hm-head-lead">
              For anything else, send an enquiry and a person will answer — not a bot.
            </p>
            <Link className="hm-btn hm-btn--ghost" to="/contact">Contact us</Link>
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

      <section className="hm-section hm-section--cta">
        <div className="container">
          <div className="hm-cta">
            <div className="hm-cta-copy">
              <p className="hm-eyebrow hm-eyebrow--light">Get started</p>
              <h2>Put the assistant to work on your own website.</h2>
              <p>
                Create an account, add your business knowledge and install the widget. If you would rather have it
                set up for you, send an enquiry and we will handle the installation.
              </p>
            </div>
            <div className="hm-cta-actions">
              <Link className="hm-btn hm-btn--light" to="/register">Create an account {arrow}</Link>
              <Link className="hm-btn hm-btn--outline-light" to="/start-a-project">Request setup help</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
