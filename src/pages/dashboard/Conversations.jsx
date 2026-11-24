import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Conversations() {
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/conversations")
      .then((data) => setList(data.conversations))
      .catch((err) => setError(err.message));
  }, []);

  async function open(id) {
    try {
      const data = await api(`/conversations/${id}`);
      setSelected(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      setList((current) => current.filter((item) => item.id !== id));
      if (selected?.conversation.id === id) setSelected(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="form-alert form-alert--error">{error}</div>;
  if (!list) return <div className="dash-loading">Loading conversations…</div>;

  return (
    <div className="dash-columns dash-columns--conversations">
      <section className="panel">
        <div className="panel-head">
          <h2>All conversations</h2>
          <p>Every chat handled by your assistants.</p>
        </div>
        {list.length ? (
          <ul className="conversation-list">
            {list.map((item) => (
              <li key={item.id}>
                <button type="button" className={selected?.conversation.id === item.id ? "is-active" : ""} onClick={() => open(item.id)}>
                  <strong>{item.title}</strong>
                  <span>{item.assistantName} · {item.messageCount} messages</span>
                  <span className="conversation-preview">{item.lastMessage}</span>
                </button>
                <button type="button" className="panel-link panel-link--danger" onClick={() => remove(item.id)}>Delete</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No conversations yet. Test an assistant to create one.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{selected ? selected.conversation.title : "Transcript"}</h2>
          {selected ? <p>{selected.conversation.assistantName}</p> : <p>Select a conversation to read it.</p>}
        </div>
        {selected ? (
          <div className="transcript">
            {selected.messages.map((message) => (
              <div key={message.id} className={`chat-msg chat-msg--${message.role}`}>
                <span className="chat-role">{message.role === "user" ? "Customer" : selected.conversation.assistantName}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Nothing selected yet.</div>
        )}
      </section>
    </div>
  );
}
