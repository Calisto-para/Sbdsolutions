import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { env } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/* Every statement is idempotent, so this is safe to run at every boot. */
export async function migrate() {
  const sql = fs.readFileSync(path.join(here, "schema.sql"), "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await query(statement);
  }

  for (const address of env.adminEmails) {
    await query("update users set role = 'admin', updated_at = now() where lower(email) = $1 and role <> 'admin'", [address]);
  }

  console.log(`[db] schema ready (${statements.length} statements)`);
}
