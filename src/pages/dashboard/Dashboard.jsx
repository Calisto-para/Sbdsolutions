import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Overview from "./Overview";
import KnowledgeBase from "./KnowledgeBase";
import Assistants from "./Assistants";
import AssistantWorkspace from "./AssistantWorkspace";
import Chatbot from "./Chatbot";
import Leads from "./Leads";
import Subscriptions from "./Subscriptions";
import Support from "./Support";
import Requests from "./Requests";
import AccountSettings from "./AccountSettings";
import Usage from "./Usage";
import LiveChat from "./LiveChat";
import Notifications from "./Notifications";

const SECTIONS = [
  { key: "overview", label: "Dashboard Overview", icon: "M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-13h6V4h-6v3Z" },
  { key: "knowledge", label: "Knowledge Base", icon: "M4 20h16M6 20V9m4 11V9m4 11V9m4 11V9M4 9l8-5 8 5" },
  { key: "assistants", label: "My AI Agents", icon: "M7 7h10v10H7zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" },
  { key: "chatbot", label: "Website Chatbot", icon: "M7 7h10v10H7zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" },
  { key: "leads", label: "Leads", icon: "M4 5h16v14H4zM4 8l8 5 8-5" },
  { key: "usage", label: "Usage & Credits", icon: "M4 19V5M4 19h16M8 16V10m4 6V7m4 9v-4" },
  { key: "live", label: "Unified inbox", icon: "M21 12a8 8 0 0 1-12 7L4 21l1.6-4.4A8 8 0 1 1 21 12Z" },
  { key: "notifications", label: "Notifications", icon: "M12 4a5 5 0 0 1 5 5v4l2 3H5l2-3V9a5 5 0 0 1 5-5Zm-2 15h4" },
  { key: "subscriptions", label: "Subscription", icon: "M4 7h16v10H4zM4 10h16M8 16h3" },
  { key: "requests", label: "Custom requests", icon: "M4 7h16M4 12h10M4 17h7" },
  { key: "support", label: "Support", icon: "M12 3a8 8 0 0 1 8 8v5a3 3 0 0 1-3 3h-2M4 12a8 8 0 0 1 8-8M8 20H6a2 2 0 0 1-2-2v-3" },
  { key: "settings", label: "Account Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a8 8 0 0 1-.2 1.7l2 1.5-2 3.4-2.3-1a8 8 0 0 1-2.9 1.7L14 25h-4l-.6-2.7a8 8 0 0 1-2.9-1.7l-2.3 1-2-3.4 2-1.5A8 8 0 0 1 4 15c0-.6.1-1.2.2-1.7l-2-1.5 2-3.4 2.3 1a8 8 0 0 1 2.9-1.7L10 5h4l.6 2.7a8 8 0 0 1 2.9 1.7l2.3-1 2 3.4-2 1.5c.1.5.2 1.1.2 1.7Z" },
];

export default function Dashboard() {
  const { user, status, business, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "loading") {
    return <div className="dash-loading">Loading your dashboard…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const requestedTab = params.get("tab") || "overview";
  /* The old Conversations screen duplicated the inbox; old links land on the
     single unified inbox instead. */
  const tab = requestedTab === "conversations" ? "live" : requestedTab;
  const assistantId = params.get("id") || "";

  const go = (next) => {
    setMenuOpen(false);
    setParams(next);
    window.scrollTo(0, 0);
  };

  const title =
    tab === "assistant"
      ? "AI assistant workspace"
      : SECTIONS.find((section) => section.key === tab)?.label || "Dashboard";

  return (
    <div className="dash">
      <aside className={`dash-side${menuOpen ? " is-open" : ""}`}>
        <Link className="dash-brand" to="/">
          <img className="dash-brand-tile" src="/brand/sbd-solutions-mark.png" alt="" width="34" height="34" />
          <span>SBD Solutions</span>
        </Link>
        <nav className="dash-nav" aria-label="Dashboard sections">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={tab === section.key ? "is-active" : ""}
              onClick={() => go({ tab: section.key })}
            >
              <svg viewBox="0 0 26 30" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d={section.icon} />
              </svg>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
        <div className="dash-side-foot">
          <Link to="/" className="dash-side-link">View website</Link>
          <button
            type="button"
            className="dash-side-link"
            onClick={async () => {
              await logout();
              window.location.href = "/login";
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
            aria-label="Toggle dashboard menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div>
            <h1 className="dash-title">{title}</h1>
            <p className="dash-sub">
              {business?.name || user.businessName || "Your business"} · {user.email}
            </p>
          </div>
          <div className="dash-user">
            <span className="dash-avatar" aria-hidden="true">
              {(user.fullName || "S").trim().charAt(0).toUpperCase()}
            </span>
            <span className="dash-user-name">{user.fullName}</span>
          </div>
        </header>

        {!user.emailVerified ? (
          <div className="dash-banner" role="status">
            Your email is not verified yet. Open the verification link we sent to {user.email} to keep full access.
          </div>
        ) : null}

        <div className="dash-body">
          {tab === "overview" ? <Overview onNavigate={go} /> : null}
          {tab === "knowledge" || tab === "business" ? <KnowledgeBase /> : null}
          {tab === "assistants" ? <Assistants onOpen={(id) => go({ tab: "assistant", id })} /> : null}
          {tab === "assistant" && assistantId ? (
            <AssistantWorkspace assistantId={assistantId} onBack={() => go({ tab: "assistants" })} onNavigate={go} />
          ) : null}
          {tab === "assistant" && !assistantId ? (
            <div className="empty">Choose an assistant from My AI Assistants.</div>
          ) : null}
          {tab === "chatbot" ? <Chatbot /> : null}
          {tab === "leads" ? <Leads /> : null}
          {tab === "usage" ? <Usage onNavigate={go} /> : null}
          {tab === "live" ? (
            <LiveChat
              initialConversationId={params.get("conversation") || ""}
              onNavigate={go}
            />
          ) : null}
          {tab === "notifications" ? <Notifications onNavigate={go} /> : null}
          {tab === "subscriptions" ? <Subscriptions /> : null}
          {tab === "requests" ? <Requests user={user} /> : null}
          {tab === "support" ? <Support /> : null}
          {tab === "settings" ? <AccountSettings /> : null}
        </div>
      </div>
    </div>
  );
}
