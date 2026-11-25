import express from "express";
import { z } from "zod";
import {
  hashPassword,
  checkPassword,
  randomToken,
  hashToken,
  setSessionCookie,
  clearSessionCookie,
  publicUser,
  requireAuth,
} from "../auth.js";
import { query, one } from "../db.js";
import { env, emailConfigured } from "../env.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../mail.js";

const router = express.Router();
const VERIFY_HOURS = 24;
const RESET_MINUTES = 60;

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200)
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: "Include at least one letter and one number.",
  });

const devLink = (link) => (!emailConfigured && !env.isProd ? { previewUrl: link } : {});

/* Operator allowlist: the account becomes an admin as soon as it is created or
   signs in, even if it appeared after the last boot. */
async function promoteIfAllowlisted(user) {
  if (!user || user.role === "admin") return user;
  if (!env.adminEmails.includes(String(user.email).toLowerCase())) return user;
  return one("update users set role = 'admin', updated_at = now() where id = $1 returning *", [user.id]);
}

async function issueVerification(user) {
  const token = randomToken();
  await query(
    `update users
        set verification_token_hash = $2,
            verification_expires_at = now() + ($3 || ' hours')::interval,
            updated_at = now()
      where id = $1`,
    [user.id, hashToken(token), VERIFY_HOURS]
  );
  const link = `${env.appUrl}/verify-email?token=${token}`;
  const result = await sendVerificationEmail(user, link);
  return { link, ...result };
}

router.post("/register", async (req, res, next) => {
  try {
    const body = z
      .object({
        fullName: z.string().trim().min(2, "Enter your full name.").max(120),
        businessName: z.string().trim().max(160).optional().default(""),
        email,
        phone: z.string().trim().min(6, "Enter a phone number.").max(40),
        country: z.string().trim().min(2, "Select a country.").max(80),
        password,
        confirmPassword: z.string(),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      })
      .parse(req.body);

    const existing = await one("select * from users where lower(email) = $1", [body.email]);

    if (existing?.email_verified_at) {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
    }

    let user = existing;
    if (existing) {
      user = await one(
        `update users
            set full_name = $2, business_name = $3, phone = $4, country = $5, password_hash = $6, updated_at = now()
          where id = $1
          returning *`,
        [existing.id, body.fullName, body.businessName, body.phone, body.country, await hashPassword(body.password)]
      );
    } else {
      user = await one(
        `insert into users (full_name, business_name, email, phone, country, password_hash)
         values ($1, $2, $3, $4, $5, $6)
         returning *`,
        [body.fullName, body.businessName, body.email, body.phone, body.country, await hashPassword(body.password)]
      );
    }

    await promoteIfAllowlisted(user);
    const verification = await issueVerification(user);

    res.status(201).json({
      ok: true,
      message: emailConfigured
        ? "Account created. Check your inbox for the verification link."
        : "Account created. Email delivery is not configured yet, so the verification link is shown below.",
      ...devLink(verification.link),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(20) }).parse(req.body);
    const user = await one(
      `select * from users
        where verification_token_hash = $1 and verification_expires_at > now()`,
      [hashToken(token)]
    );
    if (!user) {
      return res.status(400).json({ error: "This verification link is invalid or has expired. Request a new one below." });
    }

    await query(
      `update users
          set email_verified_at = now(), verification_token_hash = null, verification_expires_at = null, updated_at = now()
        where id = $1`,
      [user.id]
    );

    const promoted = await promoteIfAllowlisted(user);
    setSessionCookie(res, promoted.id);
    res.json({ ok: true, message: "Email verified. Your account is ready.", user: publicUser({ ...promoted, email_verified_at: new Date() }) });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-verification", async (req, res, next) => {
  try {
    const { email: address } = z.object({ email }).parse(req.body);
    const user = await one("select * from users where lower(email) = $1", [address]);
    if (user && !user.email_verified_at) {
      const verification = await issueVerification(user);
      return res.json({
        ok: true,
        message: emailConfigured ? "A new verification link is on its way." : "Email delivery is not configured yet, so the link is shown below.",
        ...devLink(verification.link),
      });
    }
    res.json({ ok: true, message: "If that address needs verification, a new link has been sent." });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = z
      .object({ email, password: z.string().min(1, "Enter your password.").max(200) })
      .parse(req.body);

    let user = await one("select * from users where lower(email) = $1", [body.email]);
    if (!user || !(await checkPassword(body.password, user.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    if (!user.email_verified_at) {
      return res.status(403).json({
        error: "Please verify your email address before signing in.",
        code: "EMAIL_UNVERIFIED",
      });
    }

    user = await promoteIfAllowlisted(user);

    setSessionCookie(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const business = await one("select * from businesses where user_id = $1", [req.user.id]);
    res.json({ user: publicUser(req.user), business: business || null });
  } catch (error) {
    next(error);
  }
});

router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(120),
        businessName: z.string().trim().max(160).optional().default(""),
        phone: z.string().trim().max(40).optional().default(""),
        country: z.string().trim().max(80).optional().default(""),
        email,
        preferences: z.record(z.any()).optional(),
      })
      .parse(req.body);

    const emailChanged = body.email !== req.user.email;
    if (emailChanged) {
      const taken = await one("select id from users where lower(email) = $1 and id <> $2", [body.email, req.user.id]);
      if (taken) return res.status(409).json({ error: "That email address is already in use." });
    }

    const updated = await one(
      `update users
          set full_name = $2,
              business_name = $3,
              phone = $4,
              country = $5,
              email = $6,
              preferences = coalesce($7, preferences),
              email_verified_at = case when email = $6 then email_verified_at else null end,
              updated_at = now()
        where id = $1
        returning *`,
      [req.user.id, body.fullName, body.businessName, body.phone, body.country, body.email, body.preferences || null]
    );

    if (emailChanged) await issueVerification(updated);

    res.json({
      ok: true,
      user: publicUser(updated),
      message: emailChanged
        ? "Profile updated. Verify your new email address to keep full access."
        : "Profile updated.",
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/password", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: password, confirmPassword: z.string() })
      .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      })
      .parse(req.body);

    if (!(await checkPassword(body.currentPassword, req.user.password_hash))) {
      return res.status(400).json({ error: "Your current password is incorrect." });
    }

    await query("update users set password_hash = $2, updated_at = now() where id = $1", [
      req.user.id,
      await hashPassword(body.newPassword),
    ]);
    res.json({ ok: true, message: "Password updated." });
  } catch (error) {
    next(error);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email: address } = z.object({ email }).parse(req.body);
    const user = await one("select * from users where lower(email) = $1", [address]);

    if (user) {
      const token = randomToken();
      await query(
        `update users
            set reset_token_hash = $2,
                reset_expires_at = now() + ($3 || ' minutes')::interval,
                updated_at = now()
          where id = $1`,
        [user.id, hashToken(token), RESET_MINUTES]
      );
      const link = `${env.appUrl}/reset-password?token=${token}`;
      const result = await sendPasswordResetEmail(user, link);
      return res.json({
        ok: true,
        message: emailConfigured
          ? "If that email is registered, a reset link is on its way."
          : "Email delivery is not configured yet, so the reset link is shown below.",
        ...devLink(result.previewUrl || link),
      });
    }

    res.json({ ok: true, message: "If that email is registered, a reset link is on its way." });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const body = z
      .object({ token: z.string().min(20), password, confirmPassword: z.string() })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      })
      .parse(req.body);

    const user = await one(
      "select * from users where reset_token_hash = $1 and reset_expires_at > now()",
      [hashToken(body.token)]
    );
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    }

    await query(
      `update users
          set password_hash = $2, reset_token_hash = null, reset_expires_at = null, updated_at = now()
        where id = $1`,
      [user.id, await hashPassword(body.password)]
    );

    setSessionCookie(res, user.id);
    res.json({ ok: true, message: "Password updated. You are signed in." });
  } catch (error) {
    next(error);
  }
});

export default router;
