import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/services", label: "Services" },
  { to: "/register", label: "AI Platform" },
  { to: "/pricing", label: "Pricing" },
  { to: "/projects", label: "Projects" },
  { to: "/contact", label: "Contact" },
];

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
  const signedIn = status === "ready" && Boolean(user);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setNavOpen((wasOpen) => {
        if (wasOpen) headerRef.current?.querySelector(".menu-toggle")?.focus();
        return false;
      });
    };
    const onResize = () => {
      if (window.innerWidth > 940) setNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

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
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} {...linkProps(pathname === link.to)}>
              {link.label}
            </Link>
          ))}

          <div className="nav-account">
            {signedIn ? (
              <>
                <Link to="/dashboard">Dashboard</Link>
                <button type="button" className="nav-account-button" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link className="nav-cta" to="/register">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
        <div className="header-actions">
          {signedIn ? (
            <>
              <button type="button" className="header-signin" onClick={signOut}>
                Sign out
              </button>
              <Link className="btn btn--primary btn--sm" to="/dashboard">
                My Dashboard {ARROW}
              </Link>
            </>
          ) : (
            <>
              <Link className="header-signin" to="/login">
                Login
              </Link>
              <Link className="btn btn--primary btn--sm" to="/register">
                Get Started {ARROW}
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
