/* SBD AI Solutions website chat widget.
   Install with one line:
   <script src="https://your-site/widget.js" data-assistant="PUBLIC_KEY" async></script>
   It renders its own markup and styles, so it cannot clash with the host page. */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-assistant");
  if (!key) return;

  var base = script.src ? new URL(script.src).origin : "";
  var storeKey = "sbd-chat-" + key;
  var conversationId = "";
  var lastMessageIds = {};
  var open = false;
  var config = null;
  var polling = null;
  var busy = false;
  var typing = null;
  var resolvedNoted = false;

  try {
    conversationId = sessionStorage.getItem(storeKey) || "";
  } catch (error) {
    conversationId = "";
  }

  function saveConversation(id) {
    conversationId = id;
    resolvedNoted = false;
    try {
      sessionStorage.setItem(storeKey, id);
    } catch (error) {
      /* private browsing — the chat simply starts fresh next time */
    }
  }

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
    ".sbdw-panel{position:absolute;bottom:72px;width:340px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 48px rgba(11,31,58,.22);display:flex;flex-direction:column;overflow:hidden}",
    ".sbdw-root--right .sbdw-panel{right:0}.sbdw-root--left .sbdw-panel{left:0}",
    ".sbdw-head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}",
    ".sbdw-title{font-weight:600;font-size:15px;margin:0}",
    ".sbdw-sub{font-size:12px;opacity:.8;display:block}",
    ".sbdw-close{background:transparent;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}",
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
    ".sbdw-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e6eefb;background:#fff}",
    ".sbdw-input{flex:1;border:1px solid #cfdcf3;border-radius:10px;padding:9px 11px;font:inherit;min-width:0}",
    ".sbdw-send{border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}",
    ".sbdw-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid #eef3fc;background:#fff;font-size:11px;color:#5a6c88}",
    ".sbdw-link{background:none;border:0;color:#0b5cff;font:inherit;cursor:pointer;padding:0;text-decoration:underline}",
    ".sbdw-details{display:none;gap:6px;flex-direction:column;padding:10px 12px;border-top:1px solid #e6eefb;background:#fbfdff}",
    ".sbdw-details.is-open{display:flex}",
    ".sbdw-details input{border:1px solid #cfdcf3;border-radius:8px;padding:7px 9px;font:inherit}",
    ".sbdw-details button{border:0;border-radius:8px;padding:8px;font:inherit;font-weight:600;cursor:pointer}",
    ".sbdw-status{font-size:12px;color:#b42318;padding:0 14px 8px}",
    ".sbdw-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
    ".sbdw-foot{flex-wrap:wrap}",
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

  var details = el("div", "sbdw-details");
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
  var newChatLink = el("button", "sbdw-link", "New chat");
  newChatLink.type = "button";
  var endChatLink = el("button", "sbdw-link", "End chat");
  endChatLink.type = "button";
  endChatLink.style.display = "none";
  actions.appendChild(detailsLink);
  actions.appendChild(newChatLink);
  actions.appendChild(endChatLink);
  var powered = el("span", "", "SBD AI Solutions");
  foot.appendChild(actions);
  foot.appendChild(powered);

  panel.appendChild(head);
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

  function addMessage(message, remember) {
    if (remember != null) {
      if (lastMessageIds[remember]) return;
      lastMessageIds[remember] = true;
    }
    var kind = message.author === "team" ? "team" : message.role === "user" ? "visitor" : "ai";
    var node = el("div", "sbdw-msg sbdw-msg--" + kind, message.content);
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }

  function addNote(text) {
    log.appendChild(el("div", "sbdw-note", text));
    log.scrollTop = log.scrollHeight;
  }

  /* Three animated dots while the assistant is thinking, so a slow reply never
     looks like nothing happened. */
  function showTyping() {
    if (typing) return;
    typing = el("div", "sbdw-msg sbdw-msg--ai sbdw-typing");
    typing.setAttribute("aria-label", "Assistant is typing");
    typing.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
  }

  function hideTyping() {
    if (!typing) return;
    if (typing.parentNode) typing.parentNode.removeChild(typing);
    typing = null;
  }

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
    newChatLink.style.color = bg;
    endChatLink.style.color = bg;
    title.textContent = config.name;
    subtitle.textContent = config.businessName ? config.businessName : "Ask us anything";
    root.className = "sbdw-root sbdw-root--" + (config.position === "left" ? "left" : "right");
  }

  function stopPoll() {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  }

  function showEndButton() {
    endChatLink.style.display = conversationId ? "inline" : "none";
  }

  /* Clear the conversation on this device and start from the welcome message. */
  function resetChat(note) {
    stopPoll();
    conversationId = "";
    lastMessageIds = {};
    try {
      sessionStorage.removeItem(storeKey);
    } catch (error) {
      /* private browsing */
    }
    log.innerHTML = "";
    addMessage({ role: "assistant", author: "ai", content: config.welcomeMessage }, null);
    if (note) addNote(note);
    showEndButton();
    setStatus("");
  }

  function showPanel() {
    open = true;
    panel.style.display = "flex";
    bubble.setAttribute("aria-label", "Close chat");
    if (!log.childNodes.length) {
      addMessage({ role: "assistant", author: "ai", content: config.welcomeMessage }, null);
    }
    showEndButton();
    input.focus();
    if (conversationId) poll();
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

  newChatLink.addEventListener("click", function () {
    /* Close the previous conversation in the dashboard, then start fresh. */
    if (conversationId) {
      var previous = conversationId;
      fetch(base + "/api/widget/" + key + "/conversation/" + previous + "/end", { method: "POST" }).catch(
        function () {}
      );
    }
    resetChat("Started a new conversation.");
    input.focus();
  });

  endChatLink.addEventListener("click", function () {
    if (!conversationId) {
      resetChat("Conversation ended. Thank you for chatting.");
      return;
    }
    var id = conversationId;
    endChatLink.disabled = true;
    setStatus("");
    fetch(base + "/api/widget/" + key + "/conversation/" + id + "/end", { method: "POST" })
      .then(function (response) {
        if (!response.ok) throw new Error("Could not end the chat right now.");
        resetChat("Conversation ended — thank you for chatting with us.");
      })
      .catch(function (error) {
        setStatus(error.message);
      })
      .then(function () {
        endChatLink.disabled = false;
      });
  });

  function post(path, body) {
    return fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || "Something went wrong.");
        return data;
      });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var message = input.value.trim();
    if (!message || busy) return;
    busy = true;
    send.disabled = true;
    setStatus("");
    input.value = "";
    addMessage({ role: "user", content: message }, null);
    showTyping();

    post("/api/widget/" + key + "/chat", {
      message: message,
      conversationId: conversationId || undefined,
    })
      .then(function (data) {
        hideTyping();
        saveConversation(data.conversationId);
        showEndButton();
        if (data.reply) {
          addMessage(
            { role: "assistant", author: "ai", content: data.reply },
            data.assistantMessageId || null
          );
        }
        if (data.confirmationSent) {
          addNote("We emailed you a confirmation — your message has reached the team.");
        }
        if (data.takeover) {
          addNote("A member of the team has joined this chat.");
          poll();
        }
      })
      .catch(function (error) {
        hideTyping();
        setStatus(error.message);
        addNote("Your message was not delivered.");
      })
      .then(function () {
        busy = false;
        send.disabled = false;
      });
  });

  details.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    setStatus("");
    post("/api/widget/" + key + "/lead", {
      conversationId: conversationId || undefined,
      name: dName.value.trim(),
      email: dEmail.value.trim(),
      phone: dPhone.value.trim(),
      service: dService.value.trim(),
    })
      .then(function (data) {
        saveConversation(data.conversationId);
        showEndButton();
        addNote(
          data.confirmationSent
            ? "Thank you — the team has your details and we emailed you a confirmation."
            : "Thank you — the team has your details."
        );
        details.className = "sbdw-details";
      })
      .catch(function (error) {
        setStatus(error.message);
      })
      .then(function () {
        busy = false;
      });
  });

  function poll() {
    if (polling || !conversationId) return;
    polling = setInterval(function () {
      if (!open || !conversationId) return;
      fetch(base + "/api/widget/" + key + "/conversation/" + conversationId)
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (data) {
          if (!data) return;
          data.messages.forEach(function (message) {
            if (message.author === "team" || message.author === "ai") {
              addMessage(message, message.id);
            }
          });
          if (data.status === "resolved" && !resolvedNoted) {
            resolvedNoted = true;
            addNote("This conversation was marked resolved. Start a new chat any time.");
            stopPoll();
          }
        })
        .catch(function () {});
    }, 6000);
  }

  /* A cold server or a database still warming up answers 5xx for a few
     seconds. Retry briefly instead of giving up, so the widget does not
     silently vanish for the rest of the visit. */
  var attached = false;

  function mount() {
    if (attached) return;
    attached = true;
    paint();
    document.head.appendChild(style);
    document.body.appendChild(root);
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
