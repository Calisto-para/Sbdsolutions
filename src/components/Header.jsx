import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SERVICE_LINKS = [
  { to: "/services#ai-solutions", label: "AI Solutions" },
  { to: "/services#automation", label: "Business Automation" },
  { to: "/services#software-development", label: "Software Development" },
  { to: "/services", label: "All services" },
];

const CLIENT_LINKS = [
  { to: "/who-we-help#businesses", label: "Businesses" },
  { to: "/who-we-help#startups", label: "Startups" },
  { to: "/who-we-help#organizations", label: "Organizations" },
  { to: "/who-we-help#online-businesses", label: "Online Businesses" },
];

const CARET = (
  <svg className="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="m3 4.5 3 3 3-3" />
  </svg>
);

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, status, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef(null);
  const dropRefs = useRef([]);
  const signedIn = status === "ready" && Boolean(user);

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

  const servicesActive = pathname === "/services";
  const clientsActive = pathname === "/who-we-help";
  const linkProps = (active) => (active ? { "aria-current": "page" } : {});

  const signOut = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className={`site-header${navOpen ? " nav-open" : ""}`} ref={headerRef}>
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="SBD AI Solutions home">
          <img
            className="brand-logo"
            src="/assets/sbd-ai-solutions-logo.png"
            alt="SBD AI Solutions — Intelligent Technology. Smarter Business."
            width="201"
            height="52"
          />
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
          <Link to="/projects" {...linkProps(pathname === "/projects")}>Projects</Link>
          <Link to="/about" {...linkProps(pathname === "/about")}>About Us</Link>
          <details className="nav-drop" ref={(node) => (dropRefs.current[1] = node)} onToggle={(e) => handleToggle(1, e)}>
            <summary {...linkProps(clientsActive)}>Who We Help {CARET}</summary>
            <div className="nav-drop-panel">
              {CLIENT_LINKS.map((link) => (
                <Link key={link.label} to={link.to}>{link.label}</Link>
              ))}
            </div>
          </details>
          <Link to="/contact" {...linkProps(pathname === "/contact")}>Contact</Link>

          <div className="nav-account">
            {signedIn ? (
              <>
                <Link to="/dashboard">My Dashboard</Link>
                <button type="button" className="nav-account-button" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/register">Create account</Link>
              </>
            )}
          </div>
        </nav>
        <div className="header-actions">
          {signedIn ? (
            <>
              <button type="button" className="header-signin" onClick={signOut}>Sign out</button>
              <Link className="btn btn--primary btn--sm" to="/dashboard">
                My Dashboard {ARROW}
              </Link>
            </>
          ) : (
            <>
              <Link className="header-signin" to="/login">Sign in</Link>
              <Link className="btn btn--primary btn--sm" to="/register">
                Create account {ARROW}
              </Link>
            </>
          )}
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
