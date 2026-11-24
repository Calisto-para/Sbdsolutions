import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const SERVICE_LINKS = [
  { to: "/services.html#ai-solutions", label: "AI Solutions" },
  { to: "/services.html#automation", label: "Business Automation" },
  { to: "/services.html#software-development", label: "Software Development" },
  { to: "/services.html", label: "All services" },
];

const CLIENT_LINKS = [
  { to: "/who-we-help.html#businesses", label: "Businesses" },
  { to: "/who-we-help.html#startups", label: "Startups" },
  { to: "/who-we-help.html#organizations", label: "Organizations" },
  { to: "/who-we-help.html#online-businesses", label: "Online Businesses" },
];

const CARET = (
  <svg className="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="m3 4.5 3 3 3-3" />
  </svg>
);

export default function Header() {
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef(null);
  const dropRefs = useRef([]);

  /* Route change closes the menus. */
  useEffect(() => {
    setNavOpen(false);
    dropRefs.current.forEach((drop) => {
      if (drop) drop.open = false;
    });
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setNavOpen((wasOpen) => {
        if (wasOpen) headerRef.current?.querySelector(".menu-toggle")?.focus();
        return false;
      });
      dropRefs.current.forEach((drop) => {
        if (drop) drop.open = false;
      });
    };
    const onDocumentClick = (event) => {
      dropRefs.current.forEach((drop) => {
        if (drop && drop.open && !drop.contains(event.target)) drop.open = false;
      });
    };
    const onResize = () => {
      if (window.innerWidth > 940) setNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const handleToggle = (index, event) => {
    if (!event.currentTarget.open) return;
    dropRefs.current.forEach((drop, i) => {
      if (drop && i !== index) drop.open = false;
    });
  };

  const servicesActive = pathname === "/services.html";
  const clientsActive = pathname === "/who-we-help.html";
  const linkProps = (active) => (active ? { "aria-current": "page" } : {});

  return (
    <header className={`site-header${navOpen ? " nav-open" : ""}`} ref={headerRef}>
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="SBD AI Solutions home">
          <img className="brand-mark" src="/assets/logo-mark.svg" alt="" width="46" height="46" />
          <span className="brand-text">
            <span className="brand-name">SBD AI Solutions</span>
            <span className="brand-tag">Intelligent Technology. Smarter Business.</span>
          </span>
        </Link>
        <nav className="nav" id="primary-navigation" aria-label="Primary navigation">
          <Link to="/" {...linkProps(pathname === "/")}>Home</Link>
          <details className="nav-drop" ref={(node) => (dropRefs.current[0] = node)} onToggle={(e) => handleToggle(0, e)}>
            <summary {...linkProps(servicesActive)}>Services {CARET}</summary>
            <div className="nav-drop-panel">
              {SERVICE_LINKS.map((link) => (
                <Link key={link.label} to={link.to}>{link.label}</Link>
              ))}
            </div>
          </details>
          <Link to="/projects.html" {...linkProps(pathname === "/projects.html")}>Projects</Link>
          <Link to="/about.html" {...linkProps(pathname === "/about.html")}>About Us</Link>
          <details className="nav-drop" ref={(node) => (dropRefs.current[1] = node)} onToggle={(e) => handleToggle(1, e)}>
            <summary {...linkProps(clientsActive)}>Who We Help {CARET}</summary>
            <div className="nav-drop-panel">
              {CLIENT_LINKS.map((link) => (
                <Link key={link.label} to={link.to}>{link.label}</Link>
              ))}
            </div>
          </details>
          <Link to="/contact.html" {...linkProps(pathname === "/contact.html")}>Contact</Link>
        </nav>
        <div className="header-actions">
          <Link className="btn btn--primary btn--sm" to="/start-a-project.html" {...linkProps(pathname === "/start-a-project.html")}>
            Start a Project{" "}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
          <button
            className="menu-toggle"
            type="button"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            aria-controls="primary-navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? "\u00d7" : "\u2630"}
          </button>
        </div>
      </div>
    </header>
  );
}
