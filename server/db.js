import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

let implementation = null;
let kind = "";

export function dbKind() {
  return kind;
}

async function getImplementation() {
  if (implementation) return implementation;

  if (env.databaseUrl) {
    const { default: pg } = await import("pg");
    const needsSsl =
      /neon\.tech|sslmode=require|supabase\.co|render\.com/i.test(env.databaseUrl) &&
      !/sslmode=disable/i.test(env.databaseUrl);
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_POOL_MAX || 5),
    });
    implementation = {
      async query(text, params = []) {
        const result = await pool.query(text, params);
        return result.rows;
      },
      async close() {
        await pool.end();
      },
    };
    kind = "postgres";
    return implementation;
  }

  /* Local development and tests: an embedded Postgres (PGlite). */
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(env.pgliteDir);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  implementation = {
    async query(text, params = []) {
      const result = await client.query(text, params);
      return result.rows;
    },
    async close() {
      await client.close();
    },
  };
  kind = "pglite";
  return implementation;
}

export async function query(text, params = []) {
  const db = await getImplementation();
  return db.query(text, params);
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

export async function closeDb() {
  if (implementation) await implementation.close();
  implementation = null;
}
