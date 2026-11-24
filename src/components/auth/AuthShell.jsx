import { Link } from "react-router-dom";

export default function AuthShell({ title, intro, children, footer }) {
  return (
    <section className="auth-page">
      <div className="container auth-grid">
        <aside className="auth-aside">
          <Link className="brand brand--stacked" to="/" aria-label="SBD AI Solutions home">
            <img className="brand-mark" src="/assets/logo-mark.svg" alt="" width="54" height="54" />
            <span className="brand-text">
              <span className="brand-name">SBD AI Solutions</span>
              <span className="brand-tag">Intelligent Technology. Smarter Business.</span>
            </span>
          </Link>
          <h2>Your AI assistant, built on what your business already knows.</h2>
          <ul className="auth-points">
            <li>Create and train assistants on your own content</li>
            <li>Test conversations before customers see them</li>
            <li>One private dashboard for every account</li>
          </ul>
          <p className="auth-support">
            Need a hand? <a href="https://wa.me/2349063924288" target="_blank" rel="noopener">Message us on WhatsApp</a>
          </p>
        </aside>

        <div className="auth-card">
          <h1>{title}</h1>
          {intro ? <p className="auth-intro">{intro}</p> : null}
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </div>
      </div>
    </section>
  );
}
