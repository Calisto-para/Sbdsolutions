import bcrypt from "bcryptjs";
import { one, query } from "./db.js";
import { hashPassword } from "./auth.js";
import { env } from "./env.js";

const MIN_PASSWORD = 8;

/* The operator account named by ADMIN_EMAIL/ADMIN_PASSWORD is created on first
   boot and kept in step afterwards: the password in the environment always
   works, and the account is verified and an admin. The password itself is never
   logged. */
export async function ensureEnvAdmin() {
  const email = env.adminEmail;
  const password = env.adminPassword;
  if (!email) return null;

  if (!password) {
    console.warn(`[admin] ADMIN_EMAIL is set to ${email} but ADMIN_PASSWORD is empty — no operator account was created.`);
    return null;
  }
  if (password.length < MIN_PASSWORD) {
    console.warn(`[admin] ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters — no operator account was created.`);
    return null;
  }

  const existing = await one("select * from users where lower(email) = $1", [email]);

  if (!existing) {
    const created = await one(
      `insert into users (full_name, business_name, email, password_hash, email_verified_at, role)
       values ($1, '', $2, $3, now(), 'admin')
       returning *`,
      [env.adminName || "Administrator", email, await hashPassword(password)]
    );
    await query(
      `insert into subscriptions (user_id, plan_id, status)
       values ($1, 'starter', 'active')
       on conflict (user_id) do nothing`,
      [created.id]
    );
    console.log(`[admin] created operator account ${email}`);
    return created;
  }

  const samePassword = await bcrypt.compare(password, existing.password_hash);
  const updated = await one(
    `update users
        set role = 'admin',
            email_verified_at = coalesce(email_verified_at, now()),
            password_hash = $2,
            updated_at = now()
      where id = $1
      returning *`,
    [existing.id, samePassword ? existing.password_hash : await hashPassword(password)]
  );
  /* Operators are not billed for their own platform access. */
  await query(
    `insert into subscriptions (user_id, plan_id, status)
     values ($1, 'starter', 'active')
     on conflict (user_id) do update set status = 'active', updated_at = now()
      where subscriptions.status = 'unpaid'`,
    [updated.id]
  );

  console.log(
    `[admin] operator account ${email} ready${samePassword ? "" : " (password updated from the environment)"}`
  );
  return updated;
}
