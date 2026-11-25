import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import NotFound from "../NotFound";
import AdminSignIn from "./AdminSignIn";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import AdminConversations from "./AdminConversations";
import AdminPlatform from "./AdminPlatform";
import AdminPayments from "./AdminPayments";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Customers" },
  { key: "platform", label: "Businesses & usage" },
  { key: "payments", label: "Payments" },
  { key: "conversations", label: "Conversations" },
];

/* Unlisted operator area. Nothing in the public site or the customer dashboard
   links here; non-admins see the ordinary "page does not exist" screen. */
export default function Admin() {
  const { user, status, logout } = useAuth();
  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const tag = document.createElement("meta");
    tag.setAttribute("name", "robots");
    tag.setAttribute("content", "noindex, nofollow");
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);

  useEffect(() => {
    if (user?.role === "admin") document.title = "Operations | SBD AI Solutions";
  }, [user]);

  if (status === "loading") return <div className="dash-loading">Loading…</div>;
  if (!user) return <AdminSignIn />;
  if (user.role !== "admin") return <NotFound />;

  const go = (next) => {
    setTab(next);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="dash admin">
      <aside className={`dash-side${menuOpen ? " is-open" : ""}`}>
        <span className="dash-brand">
          <img className="dash-brand-tile" src="/sbd-ai-solutions-icon.png" alt="" width="34" height="34" />
          <span>Operations</span>
        </span>
        <nav className="dash-nav" aria-label="Operations sections">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={tab === section.key ? "is-active" : ""}
              onClick={() => go(section.key)}
            >
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
        <div className="dash-side-foot">
          <button
            type="button"
            className="dash-side-link"
            onClick={async () => {
              await logout();
              window.location.href = "/admin";
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-top">
          <button
            type="button"
            className="dash-burger"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div>
            <h1 className="dash-title">{SECTIONS.find((section) => section.key === tab)?.label}</h1>
            <p className="dash-sub">{user.email}</p>
          </div>
          <div className="dash-user">
            <span className="dash-avatar" aria-hidden="true">
              {(user.fullName || "S").trim().charAt(0).toUpperCase()}
            </span>
            <span className="dash-user-name">{user.fullName}</span>
          </div>
        </header>

        <div className="dash-body">
          {tab === "overview" ? <AdminOverview onOpenUser={() => go("users")} /> : null}
          {tab === "users" ? <AdminUsers /> : null}
          {tab === "platform" ? <AdminPlatform /> : null}
          {tab === "payments" ? <AdminPayments /> : null}
          {tab === "conversations" ? <AdminConversations /> : null}
        </div>
      </div>
    </div>
  );
}
