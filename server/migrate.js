import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { env } from "./env.js";
import { ensureEnvAdmin } from "./admin-account.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/* Every statement is idempotent, so this is safe to run at every boot.
   Deploy: 2026-11-25T08:20:00Z — forces fresh build on Render. */
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
    await query(
      `update users
          set role = 'admin',
              email_verified_at = coalesce(email_verified_at, now()),
              updated_at = now()
        where lower(email) = $1 and (role <> 'admin' or email_verified_at is null)`,
      [address]
    );
  }

  /* Creates the operator account from ADMIN_EMAIL/ADMIN_PASSWORD if it is not there yet. */
  await ensureEnvAdmin();

  console.log(`[db] schema ready (${statements.length} statements) — deploy ${process.env.npm_package_version || 'dev'}`);
}
