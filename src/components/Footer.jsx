import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="brand" to="/" aria-label="SBD AI Solutions home">
              <img className="brand-mark brand-tile" src="/sbd-ai-solutions-icon.png" alt="" width="42" height="42" />
              <span className="brand-text">
                <span className="brand-name">SBD AI Solutions</span>
                <span className="brand-tag">Intelligent Technology. Smarter Business.</span>
              </span>
            </Link>
          </div>
          <div className="footer-col">
            <h3>Company</h3>
            <Link to="/about">About Us</Link>
            <Link to="/projects">Projects</Link>
            <Link to="/who-we-help">Who We Help</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <div className="footer-col">
            <h3>Services</h3>
            <Link to="/services#ai-solutions">AI Solutions</Link>
            <Link to="/services#automation">Business Automation</Link>
            <Link to="/services#software-development">Software Development</Link>
            <Link to="/services#software-development">Web Development</Link>
          </div>
          <div className="footer-col">
            <h3>Contact</h3>
            <a className="contact-line" href="https://wa.me/2349063924288" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-12 7L4 21l1.6-4.4A8 8 0 1 1 21 12Z" />
                <path d="M9 10c0 3 2.4 4.8 4.8 4.8" />
              </svg>
              WhatsApp
            </a>
            <a className="contact-line" href="tel:+2348122104576">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M7 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3Z" />
              </svg>
              +234 812 210 4576
            </a>
            <a className="contact-line" href="mailto:sbdiam.solutions@gmail.com">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              sbdiam.solutions@gmail.com
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {year} SBD AI Solutions. All rights reserved.</span>
          <span>Intelligent Technology. Smarter Business.</span>
        </div>
      </div>
    </footer>
  );
}
