import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { one } from "./db.js";

export const SESSION_COOKIE = "sbd_session";
const SESSION_DAYS = 7;

export function hashPassword(password) {
  return bcrypt.hash(password, 11);
}

export function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signSession(userId) {
  return jwt.sign({ sub: userId }, env.sessionSecret, { expiresIn: `${SESSION_DAYS}d` });
}

export function setSessionCookie(res, userId) {
  res.cookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure || env.isProd,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, env.sessionSecret);
  } catch {
    return null;
  }
}

export const publicUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  businessName: row.business_name,
  email: row.email,
  phone: row.phone,
  country: row.country,
  emailVerified: Boolean(row.email_verified_at),
  preferences: row.preferences || {},
  createdAt: row.created_at,
});

export async function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session?.sub) return res.status(401).json({ error: "Please sign in to continue." });

  const user = await one("select * from users where id = $1", [session.sub]);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Please sign in to continue." });
  }

  req.user = user;
  next();
}
