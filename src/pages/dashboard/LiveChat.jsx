import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";

const FILTERS = [
  { key: "all", label: "All conversations" },
  { key: "ai", label: "AI active" },
  { key: "requested", label: "Human requested" },
  { key: "human", label: "Human active" },
  { key: "resolved", label: "Resolved" },
  { key: "unread", label: "Unread" },
];

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

const when = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? timeFormat.format(date)
    : dayFormat.format(date);
};

const initial = (value) => String(value || "V").trim().charAt(0).toUpperCase();

const STATUS_LABEL = {
  ai_active: "AI active",
  human_requested: "Human requested",
  human_active: "Human active",
  resolved: "Resolved",
};

export default function LiveChat({ initialConversationId = "", onNavigate }) {
  const [list, setList] = useState([]);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileView, setMobileView] = useState(initialConversationId ? "thread" : "list");
  const [live, setLive] = useState("connecting");
  const transcriptRef = useRef(null);
  const sourceRef = useRef(null);
  const refreshRef = useRef({ loadList: null, open: null });
  refreshRef.current = { loadList, open: openConversation };

  const loadList = useCallback(
    async (next = {}) => {
      const params = new URLSearchParams();
      params.set("filter", next.filter ?? filter);
      if ((next.query ?? query).trim()) params.set("q", (next.query ?? query).trim());
      const [data, summary] = await Promise.all([
        api(`/live/conversations?${params.toString()}`),
        api("/live/summary"),
      ]);
      setList(data.conversations);
      setCounts(summary.counts);
    },
    [filter, query]
  );

  const openConversation = useCallback(async (id) => {
    if (!id) return;
    setSelectedId(id);
    setMobileView("thread");
    try {
      const data = await api(`/live/conversations/${id}`);
      setDetail(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadList({ filter: "all", query: "" }).catch((err) => setError(err.message));
    api("/live/summary")
      .then((data) => setCounts(data.counts))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialConversationId) openConversation(initialConversationId);
  }, [initialConversationId, openConversation]);

  /* Live updates: one SSE connection per dashboard tab. The poll below is only
     a safety net for networks that drop a long-lived connection. */
  useEffect(() => {
    let closed = false;
    const connect = () => {
      if (closed) return;
      const source = new EventSource("/api/live/stream");
      sourceRef.current = source;
      source.addEventListener("ready", () => setLive("live"));
      source.addEventListener("message", (event) => {
        let payload = {};
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!payload?.message) return;
        setList((current) =>
          current.map((item) =>
            item.id === payload.conversationId
              ? { ...item, lastMessage: payload.message.content, updatedAt: payload.message.createdAt, unread: item.unread + (payload.message.role === "user" ? 1 : 0) }
              : item
          )
        );
        setDetail((current) => {
          if (!current || current.conversation.id !== payload.conversationId) return current;
          if (current.messages.some((message) => message.id === payload.message.id)) return current;
          return { ...current, messages: [...current.messages, payload.message] };
        });
        refreshRef.current.loadList()?.catch(() => {});
      });
      source.addEventListener("conversation", () => {
        refreshRef.current.loadList()?.catch(() => {});
        setDetail((current) => {
          if (current?.conversation?.id) refreshRef.current.open(current.conversation.id);
          return current;
        });
      });
      source.addEventListener("notification", () => {
        api("/live/summary")
          .then((data) => setCounts(data.counts))
          .catch(() => {});
        refreshRef.current.loadList()?.catch(() => {});
      });
      source.onerror = () => {
        setLive("reconnecting");
        source.close();
        if (!closed) setTimeout(connect, 3000);
      };
    };
    connect();

    const fallback = setInterval(() => {
      refreshRef.current.loadList()?.catch(() => {});
      setDetail((current) => {
        if (current?.conversation?.id) refreshRef.current.open(current.conversation.id);
        return current;
      });
    }, 20000);

    return () => {
      closed = true;
      sourceRef.current?.close();
      clearInterval(fallback);
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [detail?.messages?.length, selectedId]);

  const conversation = detail?.conversation;
  const status = conversation?.status || "";
  const messages = detail?.messages || [];

  const visible = useMemo(() => list, [list]);

  async function act(action, success) {
    if (!conversation) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const result = await api(`/live/conversations/${conversation.id}/${action}`, { method: "POST" });
      setNotice(result.message || success || "");
      await openConversation(conversation.id);
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function send(event) {
    event.preventDefault();
    const text = reply.trim();
    if (!text || !conversation) return;
    const clientId = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimistic = {
      id: `pending-${clientId}`,
      role: "assistant",
      author: "team",
      content: text,
      status: "sending",
      createdAt: new Date().toISOString(),
    };
    setDetail((current) =>
      current ? { ...current, messages: [...current.messages, optimistic] } : current
    );
    setReply("");
    setBusy("send");
    setError("");
    try {
      const result = await api(`/live/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { message: text, clientId },
      });
      setDetail((current) => {
        if (!current) return current;
        const withoutPending = current.messages.filter((message) => message.id !== optimistic.id);
        if (withoutPending.some((message) => message.id === result.message.id)) {
          return { ...current, messages: withoutPending };
        }
        return {
          ...current,
          messages: [...withoutPending, result.message],
          conversation: result.conversation || current.conversation,
        };
      });
      await loadList();
    } catch (err) {
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === optimistic.id ? { ...message, status: "failed" } : message
              ),
            }
          : current
      );
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const authorLabel = (message) => {
    if (message.author === "system") return "System";
    if (message.author === "team") return "You (team)";
    if (message.role === "user") return conversation?.visitor?.name || "Visitor";
    return detail?.conversation?.assistantName || "AI assistant";
  };

  return (
    <div className={`live-shell live-shell--${mobileView}`}>
      {error ? <div className="form-alert form-alert--error live-alert">{error}</div> : null}
      {notice ? <div className="form-alert form-alert--ok live-alert">{notice}</div> : null}

      <aside className="live-rail" aria-label="Conversation filters">
        <div className="live-rail-head">
          <h2>Live chat</h2>
          <span className={`live-dot live-dot--${live}`} title={live === "live" ? "Real-time connected" : "Reconnecting"}>
            {live === "live" ? "Live" : "…"}
          </span>
        </div>
        <nav className="live-filters">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={filter === item.key ? "is-active" : ""}
              onClick={() => {
                setFilter(item.key);
                loadList({ filter: item.key }).catch((err) => setError(err.message));
              }}
            >
              <span>{item.label}</span>
              <b>{counts[item.key] ?? 0}</b>
            </button>
          ))}
        </nav>
        <p className="panel-note live-rail-note">
          Visitors can ask for a person from your website widget. Taking over pauses the AI for that chat only.
        </p>
        <button type="button" className="panel-link" onClick={() => onNavigate?.({ tab: "notifications" })}>
          Notification settings
        </button>
      </aside>

      <section className="live-list" aria-label="Conversations">
        <div className="live-search">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              loadList().catch((err) => setError(err.message));
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search visitors or messages"
              aria-label="Search conversations"
            />
            <button type="submit" className="btn btn--ghost btn--sm">
              Search
            </button>
          </form>
        </div>

        {visible.length ? (
          <ul className="live-threads">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={selectedId === item.id ? "is-active" : ""}
                  onClick={() => openConversation(item.id)}
                >
                  <span className={`live-avatar live-avatar--${item.status}`}>
                    {initial(item.visitorName)}
                  </span>
                  <span className="live-thread-body">
                    <span className="live-thread-top">
                      <strong>{item.visitorName || item.title || "Website visitor"}</strong>
                      <time>{when(item.updatedAt)}</time>
                    </span>
                    <span className="live-thread-preview">{item.lastMessage || "No messages yet"}</span>
                    <span className="live-thread-meta">
                      <span className={`live-status live-status--${item.status}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                      <span>{item.assistantName}</span>
                      {item.unread ? <span className="live-unread">{item.unread}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No conversations match this view yet.</div>
        )}
      </section>

      <section className="live-thread" aria-label="Conversation">
        {conversation ? (
          <>
            <header className="live-thread-head">
              <button
                type="button"
                className="live-back"
                onClick={() => setMobileView("list")}
                aria-label="Back to conversations"
              >
                ←
              </button>
              <div className="live-thread-who">
                <strong>{conversation.visitor?.name || conversation.title || "Website visitor"}</strong>
                <span>
                  {conversation.assistantName} · {STATUS_LABEL[status] || status}
                  {conversation.assignedOperator ? ` · ${conversation.assignedOperator.name}` : ""}
                </span>
              </div>
              <div className="live-actions">
                {status === "resolved" ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={Boolean(busy)}
                    onClick={() => act("reopen", "Conversation reopened.")}
                  >
                    Reopen
                  </button>
                ) : (
                  <>
                    {status !== "human_active" ? (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={Boolean(busy)}
                        onClick={() => act("takeover", "You have taken over this chat.")}
                      >
                        {busy === "takeover" ? "Taking over…" : "Take Over Chat"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={Boolean(busy)}
                        onClick={() => act("return", "The AI assistant is handling this chat again.")}
                      >
                        Return to AI
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={Boolean(busy)}
                      onClick={() => act("resolve", "Conversation marked as resolved.")}
                    >
                      Mark Resolved
                    </button>
                  </>
                )}
              </div>
            </header>

            {conversation.visitor?.email ||
            conversation.visitor?.phone ||
            conversation.visitor?.service ||
            detail?.lead ? (
              <div className="live-visitor-strip">
                {conversation.visitor.email ? <span>✉ {conversation.visitor.email}</span> : null}
                {conversation.visitor.phone ? <span>☎ {conversation.visitor.phone}</span> : null}
                {conversation.visitor.service ? <span>Needs: {conversation.visitor.service}</span> : null}
                {detail.lead?.source ? <span>Source: {detail.lead.source}</span> : null}
              </div>
            ) : null}

            <div className="live-transcript" ref={transcriptRef}>
              {messages.length ? (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`live-msg live-msg--${
                      message.author === "system"
                        ? "system"
                        : message.author === "team"
                          ? "team"
                          : message.role === "user"
                            ? "visitor"
                            : "ai"
                    }`}
                  >
                    <span className="live-msg-who">
                      {authorLabel(message)} · {when(message.createdAt)}
                      {message.status === "sending" ? " · sending…" : ""}
                      {message.status === "failed" ? " · not sent" : ""}
                    </span>
                    <p>{message.content}</p>
                  </div>
                ))
              ) : (
                <div className="empty">No messages in this conversation yet.</div>
              )}
            </div>

            {status === "resolved" ? (
              <p className="panel-note live-composer-note">
                This conversation is resolved. Reopen it to reply — the full history is kept.
              </p>
            ) : status === "human_active" ? (
              <form className="live-composer" onSubmit={send}>
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply to the visitor as your team…"
                  aria-label="Reply to visitor"
                  maxLength={4000}
                />
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy === "send" || !reply.trim()}>
                  {busy === "send" ? "Sending…" : "Send"}
                </button>
              </form>
            ) : (
              <div className="live-takeover-prompt">
                <p>
                  {status === "human_requested"
                    ? "This visitor asked for a person. Take over the chat to reply — the AI is paused."
                    : "The AI assistant is answering this chat. Take it over to reply yourself."}
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={Boolean(busy)}
                  onClick={() => act("takeover", "You have taken over this chat.")}
                >
                  {busy === "takeover" ? "Taking over…" : "Take Over Chat"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="live-empty">
            <h3>Select a conversation</h3>
            <p>Read the full history, take over from the AI and reply to the visitor from here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
