/* Server-sent events for the dashboard inbox and the website widget.
 *
 * SSE is used instead of a WebSocket server because the app already speaks
 * plain HTTP and the deploy target is a single Node process: one long-lived
 * GET per signed-in owner and one per open widget chat, with no extra
 * dependency, no upgrade handling and automatic browser reconnection.
 *
 * Connections are scoped by the authenticated user id (dashboard) or by a
 * signed conversation token (visitor). Nothing is broadcast to a channel the
 * caller was not authorised for.
 */

const owners = new Map(); /* userId -> Set<res> */
const visitors = new Map(); /* conversationId -> Set<res> */

const HEARTBEAT_MS = 25000;

const write = (res, event, data) => {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`);
  } catch {
    /* the connection is gone; the close handler removes it */
  }
};

function add(map, key, res) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(res);
}

function remove(map, key, res) {
  const set = map.get(key);
  if (!set) return;
  set.delete(res);
  if (!set.size) map.delete(key);
}

function attach(req, res, map, key, extra = {}) {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    /* Nginx and some proxies buffer text/event-stream without this. */
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");

  const client = { res, ...extra };
  add(map, key, res);
  write(res, "ready", { at: new Date().toISOString() });

  const beat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* cleaned up by close */
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(beat);
    remove(map, key, res);
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("error", cleanup);
  return client;
}

/* Notify every open dashboard tab of one business owner. */
export function subscribeOwner(req, res, userId) {
  return attach(req, res, owners, userId);
}

/* Notify every open widget for one conversation (the visitor's browser). */
export function subscribeVisitor(req, res, conversationId) {
  return attach(req, res, visitors, conversationId);
}

export function publishOwner(userId, event, data) {
  const set = owners.get(String(userId));
  if (!set) return 0;
  for (const res of set) write(res, event, data);
  return set.size;
}

export function publishVisitor(conversationId, event, data) {
  const set = visitors.get(String(conversationId));
  if (!set) return 0;
  for (const res of set) write(res, event, data);
  return set.size;
}

/* Used to answer "is a human actually at the dashboard right now?" so a
   visitor can be offered the offline enquiry form instead of waiting. */
export function ownerIsOnline(userId) {
  return (owners.get(String(userId))?.size || 0) > 0;
}

export function realtimeStats() {
  return {
    owners: owners.size,
    ownerConnections: [...owners.values()].reduce((total, set) => total + set.size, 0),
    conversations: visitors.size,
    visitorConnections: [...visitors.values()].reduce((total, set) => total + set.size, 0),
  };
}
