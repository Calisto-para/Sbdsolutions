/* SBD AI Solutions website chat widget.
   Install with one line:
   <script src="https://your-site/widget.js" data-assistant="PUBLIC_KEY" async></script>
   It renders its own markup and styles, so it cannot clash with the host page.

   Conversation state lives on the server. The browser keeps only a stable
   visitor id and the id of the conversation to reopen, so closing the widget,
   refreshing the page or opening a second tab restores the same chat instead of
   starting another one. Each message carries a client id, so a retried send is
   recognised by the server and never stored or answered twice. */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-assistant");
  if (!key) return;

  var base = script.src ? new URL(script.src).origin : "";
  var conversationStore = "sbd-chat-open-" + key;
  var visitorStore = "sbd-visitor";
  var pingStore = "sbd-chat-updated-" + key;
  var memory = {};

  var open = false;
  var config = null;
  var polling = null;
  var attached = false;

  function readStore(name) {
    try {
      var value = window.localStorage.getItem(name);
      if (value !== null) return value;
    } catch (error) {
      /* fall through to the in-memory copy */
    }
    return Object.prototype.hasOwnProperty.call(memory, name) ? memory[name] : "";
  }

  function writeStore(name, value) {
    memory[name] = value || "";
    try {
      if (value) window.localStorage.setItem(name, value);
      else window.localStorage.removeItem(name);
    } catch (error) {
      /* private browsing — the session still works, it just cannot be restored */
    }
  }

  function newId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (error) {
      /* older browser */
    }
    var bytes = [];
    for (var i = 0; i < 16; i += 1) bytes.push(Math.floor(Math.random() * 256));
    return (
      "v-" +
      Date.now().toString(36) +
      "-" +
      bytes
        .map(function (value) {
          return value.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  /* One identity per browser, shared by every tab and kept across visits. It is
     what makes customer counting per person and conversation reuse possible. */
  var visitorId = readStore(visitorStore);
  if (!visitorId) {
    visitorId = newId();
    writeStore(visitorStore, visitorId);
  }

  /* Earlier versions kept the open conversation in sessionStorage. Adopt it
     once so a visitor chatting when the widget was updated keeps their chat. */
  function readLegacyConversation() {
    try {
      return window.sessionStorage.getItem("sbd-chat-" + key) || "";
    } catch (error) {
      return "";
    }
  }

  var state = {
    conversationId: readStore(conversationStore) || readLegacyConversation(),
    status: "",
    takeover: false,
    messages: [],
    viewing: null,
    history: [],
    busy: false,
    pending: null,
  };

  function textColor(hex) {
    var value = String(hex || "").replace("#", "");
    if (value.length !== 6) return "#ffffff";
    var r = parseInt(value.substr(0, 2), 16);
    var g = parseInt(value.substr(2, 2), 16);
    var b = parseInt(value.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0b1f3a" : "#ffffff";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  var style = el("style");
  style.textContent = [
    ".sbdw-root{position:fixed;bottom:20px;z-index:2147483000;font-family:Segoe UI,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.45}",
    ".sbdw-root--right{right:20px}.sbdw-root--left{left:20px}",
    ".sbdw-bubble{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;box-shadow:0 10px 24px rgba(11,31,58,.24);display:flex;align-items:center;justify-content:center;transition:transform .15s ease}",
    ".sbdw-bubble:hover{transform:scale(1.05)}",
    ".sbdw-bubble svg{width:26px;height:26px}",
    ".sbdw-panel{position:absolute;bottom:72px;width:340px;max-width:calc(100vw - 32px);height:500px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 48px rgba(11,31,58,.22);display:flex;flex-direction:column;overflow:hidden}",
    ".sbdw-root--right .sbdw-panel{right:0}.sbdw-root--left .sbdw-panel{left:0}",
    ".sbdw-head{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}",
    ".sbdw-title{font-weight:600;font-size:15px;margin:0}",
    ".sbdw-sub{font-size:12px;opacity:.8;display:block}",
    ".sbdw-close{background:transparent;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}",
    ".sbdw-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #e6eefb;background:#fff}",
    ".sbdw-tool{border:1px solid #cfdcf3;background:#fff;border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;color:#0b5cff}",
    ".sbdw-tool:hover{background:#f2f7ff}",
    ".sbdw-tool[disabled]{opacity:.55;cursor:not-allowed}",
    ".sbdw-tool--primary{color:#fff;border-color:transparent}",
    ".sbdw-history{display:none;flex-direction:column;gap:6px;padding:10px 12px;background:#fbfdff;border-bottom:1px solid #e6eefb;max-height:190px;overflow-y:auto}",
    ".sbdw-history.is-open{display:flex}",
    ".sbdw-history-title{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5a6c88}",
    ".sbdw-history-item{text-align:left;border:1px solid #e3ebfa;background:#fff;border-radius:9px;padding:7px 9px;font:inherit;font-size:12px;cursor:pointer;color:#0b1f3a}",
    ".sbdw-history-item:hover{border-color:#b9cdf0;background:#f5f9ff}",
    ".sbdw-history-item span{display:block;color:#5a6c88;font-size:11px}",
    ".sbdw-log{flex:1;overflow-y:auto;padding:14px;background:#f5f8ff;display:flex;flex-direction:column;gap:10px}",
    ".sbdw-msg{max-width:85%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}",
    ".sbdw-msg--ai{background:#fff;color:#0b1f3a;border:1px solid #e3ebfa;align-self:flex-start}",
    ".sbdw-msg--visitor{background:#0b5cff;color:#fff;align-self:flex-end}",
    ".sbdw-msg--team{background:#0b1f3a;color:#fff;align-self:flex-start}",
    ".sbdw-typing{display:inline-flex;align-items:center;gap:4px;min-height:18px}",
    ".sbdw-typing span{width:6px;height:6px;border-radius:50%;background:#7c8aa3;animation:sbdw-typing 1.2s infinite ease-in-out}",
    ".sbdw-typing span:nth-child(2){animation-delay:.15s}.sbdw-typing span:nth-child(3){animation-delay:.3s}",
    "@keyframes sbdw-typing{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}",
    ".sbdw-note{font-size:12px;color:#40506b;align-self:center;text-align:center}",
    ".sbdw-note--team{background:#e8eefc;border-radius:9px;padding:7px 10px;align-self:stretch;text-align:left;color:#0b1f3a;font-weight:600}",
    ".sbdw-retry{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;background:#fff4f2;border:1px solid #f5c9c2;border-radius:9px;padding:8px 10px;align-self:stretch;font-size:12px;color:#8a2c1d}",
    ".sbdw-retry button{border:0;border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;background:#0b5cff;color:#fff}",
    ".sbdw-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e6eefb;background:#fff}",
    ".sbdw-input{flex:1;border:1px solid #cfdcf3;border-radius:10px;padding:9px 11px;font:inherit;min-width:0}",
    ".sbdw-input[disabled]{background:#f4f7fc;color:#7c8aa3}",
    ".sbdw-send{border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}",
    ".sbdw-send[disabled]{opacity:.6;cursor:not-allowed}",
    ".sbdw-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid #eef3fc;background:#fff;font-size:11px;color:#5a6c88;flex-wrap:wrap}",
    ".sbdw-link{background:none;border:0;color:#0b5cff;font:inherit;cursor:pointer;padding:0;text-decoration:underline}",
    ".sbdw-details{display:none;gap:6px;flex-direction:column;padding:10px 12px;border-top:1px solid #e6eefb;background:#fbfdff}",
    ".sbdw-details.is-open{display:flex}",
    ".sbdw-details input{border:1px solid #cfdcf3;border-radius:8px;padding:7px 9px;font:inherit}",
    ".sbdw-details button{border:0;border-radius:8px;padding:8px;font:inherit;font-weight:600;cursor:pointer}",
    ".sbdw-status{font-size:12px;color:#b42318;padding:0 14px 8px}",
    ".sbdw-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
  ].join("");

  var root = el("div", "sbdw-root sbdw-root--right");
  var bubble = el("button", "sbdw-bubble");
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.4-4.2A8 8 0 1 1 21 12Z"/></svg>';

  var panel = el("section", "sbdw-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with us");
  panel.style.display = "none";

  var head = el("div", "sbdw-head");
  var headText = el("div");
  var title = el("p", "sbdw-title");
  var subtitle = el("span", "sbdw-sub");
  headText.appendChild(title);
  headText.appendChild(subtitle);
  var close = el("button", "sbdw-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close chat");
  head.appendChild(headText);
  head.appendChild(close);

  var tools = el("div", "sbdw-tools");
  var newChatButton = el("button", "sbdw-tool", "New chat");
  newChatButton.type = "button";
  var endChatButton = el("button", "sbdw-tool", "End chat");
  endChatButton.type = "button";
  var historyButton = el("button", "sbdw-tool", "Previous chats");
  historyButton.type = "button";
  historyButton.style.display = "none";
  tools.appendChild(newChatButton);
  tools.appendChild(endChatButton);
  tools.appendChild(historyButton);

  var historyBox = el("div", "sbdw-history");
  var log = el("div", "sbdw-log");
  var status = el("div", "sbdw-status");

  var form = el("form", "sbdw-form");
  var input = el("input", "sbdw-input");
  input.placeholder = "Type your message…";
  input.setAttribute("aria-label", "Message");
  input.maxLength = 2000;
  var send = el("button", "sbdw-send", "Send");
  send.type = "submit";
  form.appendChild(input);
  form.appendChild(send);

  /* A real form: the browser only fires submit on <form>, so the panel being a
     div meant "Send my details" silently did nothing. */
  var details = el("form", "sbdw-details");
  var dName = el("input");
  dName.placeholder = "Your name";
  var dEmail = el("input");
  dEmail.placeholder = "Email address";
  dEmail.type = "email";
  var dPhone = el("input");
  dPhone.placeholder = "Phone number";
  var dService = el("input");
  dService.placeholder = "What do you need?";
  var dSend = el("button", "", "Send my details");
  dSend.type = "submit";
  [dName, dEmail, dPhone, dService, dSend].forEach(function (node) {
    details.appendChild(node);
  });

  var foot = el("div", "sbdw-foot");
  var actions = el("div", "sbdw-actions");
  var detailsLink = el("button", "sbdw-link", "Leave my details");
  detailsLink.type = "button";
  actions.appendChild(detailsLink);
  var powered = el("span", "", "SBD AI Solutions");
  foot.appendChild(actions);
  foot.appendChild(powered);

  panel.appendChild(head);
  panel.appendChild(tools);
  panel.appendChild(historyBox);
  panel.appendChild(log);
  panel.appendChild(status);
  panel.appendChild(details);
  panel.appendChild(form);
  panel.appendChild(foot);
  root.appendChild(panel);
  root.appendChild(bubble);

  function setStatus(message) {
    status.textContent = message || "";
  }

  function kindFor(message) {
    if (message.author === "team") return "team";
    return message.role === "user" ? "visitor" : "ai";
  }

  function addMessage(message) {
    var node = el("div", "sbdw-msg sbdw-msg--" + kindFor(message), message.content);
    log.appendChild(node);
    return node;
  }

  function addNote(text, className) {
    log.appendChild(el("div", className || "sbdw-note", text));
  }

  function scroll() {
    log.scrollTop = log.scrollHeight;
  }

  function isEnded() {
    /* Only the server can end a conversation. Nothing in the browser sets this
       locally, so a failed request can never leave the chat looking finished. */
    return state.status === "resolved";
  }

  function isLocked() {
    return Boolean(state.viewing) || isEnded();
  }

  function paintControls() {
    endChatButton.style.display =
      state.conversationId && !isEnded() && !state.viewing ? "inline-flex" : "none";
    historyButton.style.display = state.history.length ? "inline-flex" : "none";
    historyButton.textContent = "Previous chats (" + state.history.length + ")";

    input.disabled = isLocked() || state.busy;
    send.disabled = isLocked() || state.busy;
    input.placeholder = state.viewing
      ? "Viewing a previous conversation"
      : isEnded()
        ? "This chat has ended — start a new chat"
        : "Type your message…";
    send.textContent = state.busy ? "Sending…" : "Send";
  }

  /* The whole transcript is rebuilt from one source of truth every time, so a
     message cannot appear twice and the welcome line cannot be repeated. */
  function render(note) {
    log.innerHTML = "";
    var messages = state.viewing ? state.viewing.messages : state.messages;

    if (!messages.length) {
      addMessage({ role: "assistant", author: "ai", content: config.welcomeMessage });
    } else {
      messages.forEach(addMessage);
    }

    if (!state.viewing && state.takeover) {
      addNote("A member of our team has joined this chat — replies now come from the team.", "sbdw-note sbdw-note--team");
    }
    if (!state.viewing && isEnded()) {
      addNote("This conversation has ended. Your chat is saved under Previous chats.");
    }
    if (!state.viewing && state.pending) {
      var box = el("div", "sbdw-retry");
      box.appendChild(el("span", "", "Not sent: “" + state.pending.text.slice(0, 80) + "”"));
      var retry = el("button", "", "Try again");
      retry.type = "button";
      retry.addEventListener("click", function () {
        var pending = state.pending;
        state.pending = null;
        sendMessage(pending.text, pending.clientId);
      });
      box.appendChild(retry);
      log.appendChild(box);
    }
    if (note) addNote(note);

    paintControls();
    scroll();
  }

  function loadHistory() {
    if (!visitorId) return Promise.resolve();
    return fetch(base + "/api/widget/" + key + "/visitor/" + encodeURIComponent(visitorId) + "/conversations")
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        state.history = data.conversations || [];
        if (!state.conversationId && data.open && data.open.id) {
          state.conversationId = data.open.id;
          writeStore(conversationStore, state.conversationId);
          return loadConversation();
        }
        paintHistory();
        paintControls();
      })
      .catch(function () {});
  }

  function paintHistory() {
    historyBox.innerHTML = "";
    if (!state.history.length) {
      historyBox.className = "sbdw-history";
      return;
    }
    historyBox.appendChild(el("span", "sbdw-history-title", "Earlier conversations"));
    state.history.forEach(function (item) {
      var button = el("button", "sbdw-history-item");
      button.type = "button";
      button.appendChild(el("strong", "", item.title || "Website chat"));
      var when = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "";
      var ending = item.status === "resolved" ? "closed" : "open";
      button.appendChild(el("span", "", when + " · " + ending + " · tap to read"));
      button.addEventListener("click", function () {
        viewConversation(item);
      });
      historyBox.appendChild(button);
    });
  }

  function viewConversation(item) {
    setStatus("");
    historyBox.className = "sbdw-history";
    state.viewing = { id: item.id, title: item.title, messages: [] };
    render("Loading that conversation…");
    fetch(base + "/api/widget/" + key + "/conversation/" + encodeURIComponent(item.id))
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data) {
          state.viewing = null;
          setStatus("That conversation is no longer available.");
          render();
          return;
        }
        state.viewing.messages = data.messages || [];
        render(
          data.status === "resolved"
            ? "This conversation has ended. Start a new chat whenever you are ready."
            : "You are reading an earlier conversation. Start a new chat to keep talking."
        );
      })
      .catch(function () {
        state.viewing = null;
        setStatus("Could not open that conversation.");
        render();
      });
  }

  function loadConversation() {
    if (!state.conversationId) {
      render();
      return Promise.resolve();
    }
    return fetch(base + "/api/widget/" + key + "/conversation/" + encodeURIComponent(state.conversationId))
      .then(function (response) {
        if (response.status === 404) return { gone: true };
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        if (data.gone) {
          state.conversationId = "";
          state.messages = [];
          state.status = "";
          state.takeover = false;
          writeStore(conversationStore, "");
          render();
          return;
        }
        state.status = data.status || "";
        state.takeover = Boolean(data.takeover);
        state.messages = data.messages || [];
        /* Persist the adopted conversation under the shared key, so every tab
           and later visits reopen the same chat. */
        if (!readStore(conversationStore)) writeStore(conversationStore, state.conversationId);
        if (state.status === "resolved") stopPoll();
        render();
      })
      .catch(function () {});
  }

  function rememberEnded(id, title) {
    if (!id) return;
    state.history = state.history.filter(function (item) {
      return item.id !== id;
    });
    state.history.unshift({
      id: id,
      title: title || "Website chat",
      status: "resolved",
      updatedAt: new Date().toISOString(),
    });
    paintHistory();
  }

  function endRemotely(id) {
    if (!id) return Promise.resolve(null);
    return fetch(base + "/api/widget/" + key + "/conversation/" + id + "/end", { method: "POST" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function conversationTitle() {
    var first = state.messages.filter(function (message) {
      return message.role === "user";
    })[0];
    return first ? first.content.slice(0, 60) : "Website chat";
  }

  function startFresh(previousEnded) {
    var previous = state.conversationId;
    state.conversationId = "";
    state.status = "";
    state.takeover = false;
    state.messages = [];
    state.viewing = null;
    state.pending = null;
    state.busy = false;
    writeStore(conversationStore, "");
    stopPoll();
    setStatus("");
    if (previousEnded && previous) rememberEnded(previous, conversationTitle());
    render();
    input.focus();
  }

  function broadcast() {
    writeStore(pingStore, String(Date.now()));
  }

  function stopPoll() {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  }

  function poll() {
    if (polling || !state.conversationId) return;
    polling = setInterval(function () {
      if (!open || !state.conversationId || isEnded() || state.viewing) return;
      loadConversation();
    }, 6000);
  }

  function showPanel() {
    open = true;
    panel.style.display = "flex";
    bubble.setAttribute("aria-label", "Close chat");
    paintControls();
    if (state.conversationId) {
      loadConversation().then(function () {
        if (!isEnded()) poll();
      });
    } else {
      loadHistory();
      render();
    }
    input.focus();
  }

  function hidePanel() {
    open = false;
    panel.style.display = "none";
    bubble.setAttribute("aria-label", "Open chat");
  }

  bubble.addEventListener("click", function () {
    if (open) hidePanel();
    else showPanel();
  });
  close.addEventListener("click", hidePanel);

  detailsLink.addEventListener("click", function () {
    details.className = details.className.indexOf("is-open") >= 0 ? "sbdw-details" : "sbdw-details is-open";
  });

  newChatButton.addEventListener("click", function () {
    var previous = state.conversationId;
    /* Only a conversation that already exists needs ending; an untouched chat
       simply resets. */
    if (previous) {
      endRemotely(previous);
      rememberEnded(previous, conversationTitle());
    }
    startFresh(false);
  });

  endChatButton.addEventListener("click", function () {
    setStatus("");
    if (!state.conversationId) return;
    var id = state.conversationId;
    endChatButton.disabled = true;
    endRemotely(id)
      .then(function (data) {
        if (!data || data.status !== "resolved") {
          throw new Error("We could not end the chat right now. Please try again.");
        }
        state.status = "resolved";
        rememberEnded(id, conversationTitle());
        stopPoll();
        /* The closed chat stays readable in this session and in Previous chats,
           but a reload starts a genuinely new conversation instead of
           reopening a conversation that has ended. */
        writeStore(conversationStore, "");
        render();
      })
      .catch(function (error) {
        setStatus(error.message);
      })
      .then(function () {
        endChatButton.disabled = false;
        paintControls();
      });
  });

  function post(path, body) {
    return fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || "Something went wrong. Please try again.");
          error.code = data.code || "";
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function showTyping() {
    if (log.querySelector("[data-typing]")) return;
    var typing = el("div", "sbdw-msg sbdw-msg--ai sbdw-typing");
    typing.setAttribute("data-typing", "1");
    typing.setAttribute("aria-label", "Assistant is typing");
    typing.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(typing);
    scroll();
  }

  function hideTyping() {
    var typing = log.querySelector("[data-typing]");
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
  }

  /* Every send uses one client id for the lifetime of that message, including
     retries, so the server can recognise a repeat and answer it once. */
  function sendMessage(text, clientId) {
    if (!text || state.busy || isLocked()) return;
    var messageId = clientId || newId();
    state.busy = true;
    state.pending = null;
    setStatus("");

    if (!clientId) {
      state.messages = state.messages.concat([{ role: "user", author: "visitor", content: text }]);
    }
    render();
    showTyping();
    paintControls();

    post("/api/widget/" + key + "/chat", {
      message: text,
      conversationId: state.conversationId || undefined,
      visitorId: visitorId,
      clientMessageId: messageId,
    })
      .then(function (data) {
        hideTyping();
        state.conversationId = data.conversationId || state.conversationId;
        writeStore(conversationStore, state.conversationId);
        state.status = "open";
        state.takeover = Boolean(data.takeover);
        state.pending = null;
        if (data.pending) {
          /* The first attempt is still producing the answer; the poll collects
             it. Nothing is sent twice. */
          setStatus("Still working on a reply — this can take a moment.");
        } else if (data.confirmationSent) {
          setStatus("");
        }
        return loadConversation().then(function () {
          if (state.takeover) poll();
          broadcast();
          loadHistory();
        });
      })
      .catch(function (error) {
        hideTyping();
        if (error.code === "CONVERSATION_ENDED") {
          state.status = "resolved";
          rememberEnded(state.conversationId, conversationTitle());
          stopPoll();
          setStatus(error.message);
          render();
          return;
        }
        if (error.data && error.data.conversationId) {
          state.conversationId = error.data.conversationId;
          writeStore(conversationStore, state.conversationId);
        }

        /* The server stores the message before it calls the assistant, so an
           assistant failure is not a delivery failure. Never tell the visitor
           "not sent" for a message that is already saved. */
        var saved = Boolean(error.data && (error.data.userMessageId || error.data.conversationId));
        if (saved) {
          state.pending = null;
          setStatus("");
          var savedNote =
            error.code === "AI_UNAVAILABLE"
              ? "Our assistant could not answer this one. Your message is saved and the team has been notified — leave your details and we will reply."
              : "Your message is saved. " + error.message;
          if (error.code === "AI_UNAVAILABLE") details.className = "sbdw-details is-open";
          return loadConversation().then(function () {
            render(savedNote);
          });
        }

        /* Nothing reached the server: keep the text and its id so "try again"
           cannot create a duplicate if it did arrive after all. */
        state.pending = { text: text, clientId: messageId };
        setStatus(error.message);
        return loadConversation().then(function () {
          render();
        });
      })
      .then(function () {
        state.busy = false;
        paintControls();
      });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var message = input.value.trim();
    if (!message) return;
    input.value = "";
    sendMessage(message, "");
  });

  details.addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.busy || isLocked()) return;
    state.busy = true;
    setStatus("");
    paintControls();
    post("/api/widget/" + key + "/lead", {
      conversationId: state.conversationId || undefined,
      visitorId: visitorId,
      name: dName.value.trim(),
      email: dEmail.value.trim(),
      phone: dPhone.value.trim(),
      service: dService.value.trim(),
    })
      .then(function (data) {
        state.conversationId = data.conversationId || state.conversationId;
        writeStore(conversationStore, state.conversationId);
        details.className = "sbdw-details";
        render(
          data.confirmationSent
            ? "Thank you — the team has your details and we emailed you a confirmation."
            : "Thank you — the team has your details."
        );
        loadHistory();
      })
      .catch(function (error) {
        setStatus(error.message);
      })
      .then(function () {
        state.busy = false;
        paintControls();
      });
  });

  /* A second tab shares the same visitor and conversation. When one tab sends a
     message or starts a conversation, the others reload instead of diverging. */
  window.addEventListener("storage", function (event) {
    if (!event.key) return;
    if (event.key === pingStore || event.key === conversationStore) {
      var stored = readStore(conversationStore);
      if (stored !== state.conversationId) {
        state.conversationId = stored;
        state.viewing = null;
        state.messages = [];
      }
      if (event.key === pingStore) loadHistory();
      if (state.conversationId) loadConversation();
      else render();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && open && state.conversationId && !isEnded()) {
      loadConversation();
    }
  });

  function paint() {
    var bg = config.color || "#0b5cff";
    var fg = textColor(bg);
    head.style.background = bg;
    head.style.color = fg;
    bubble.style.background = bg;
    bubble.style.color = fg;
    send.style.background = bg;
    send.style.color = fg;
    dSend.style.background = bg;
    dSend.style.color = fg;
    detailsLink.style.color = bg;
    newChatButton.style.color = bg;
    endChatButton.style.color = bg;
    historyButton.style.color = bg;
    title.textContent = config.name;
    subtitle.textContent = config.businessName ? config.businessName : "Ask us anything";
    root.className = "sbdw-root sbdw-root--" + (config.position === "left" ? "left" : "right");
  }

  function mount() {
    if (attached) return;
    attached = true;
    paint();
    document.head.appendChild(style);
    document.body.appendChild(root);
    paintHistory();
    paintControls();
    if (state.conversationId) {
      loadConversation().then(loadHistory);
    } else {
      loadHistory();
    }
  }

  function loadConfig(attempt) {
    fetch(base + "/api/widget/" + key)
      .then(function (response) {
        if (response.ok) return response.json();
        if (response.status >= 500) throw new Error("server warming up");
        return null;
      })
      .then(function (data) {
        if (!data || !data.assistant || !data.assistant.active) return;
        config = data.assistant;
        mount();
      })
      .catch(function () {
        if (attempt < 5) {
          setTimeout(function () {
            loadConfig(attempt + 1);
          }, 1500 * attempt);
        }
      });
  }

  loadConfig(1);
})();
