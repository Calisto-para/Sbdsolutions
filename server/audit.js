import { query } from "./db.js";

/* Audit entries are for operators, never for customers. A failed write must
   not break the action that was being audited, so errors are swallowed after
   being logged once. */
export async function logAudit({ actorId, action, target = "", meta = {} }) {
  try {
    await query(
      `insert into audit_log (actor_id, action, target, meta) values ($1, $2, $3, $4::jsonb)`,
      [actorId || null, String(action || "unknown"), String(target || ""), JSON.stringify(meta || {})]
    );
  } catch (error) {
    console.error("[audit] write failed:", error?.message || error);
  }
}
