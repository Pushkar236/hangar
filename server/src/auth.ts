import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";

export interface User {
  id: string;
  email: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): string | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: string };
    return p.sub ?? null;
  } catch {
    return null;
  }
}

/** Extract the userId from an `Authorization: Bearer <jwt>` header value. */
export function userIdFromHeader(header?: string): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? verifyToken(m[1]) : null;
}

export async function signup(
  emailRaw: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
  if (!password || password.length < 8) throw new Error("Password must be 8+ characters");
  const id = randomUUID();
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)", [
      id,
      email,
      hash,
    ]);
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate")) throw new Error("Email already registered");
    throw e;
  }
  return { token: signToken(id), user: { id, email } };
}

export async function login(
  emailRaw: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const email = (emailRaw || "").trim().toLowerCase();
  const r = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email=$1",
    [email],
  );
  if (r.rowCount === 0 || !(await bcrypt.compare(password, r.rows[0].password_hash)))
    throw new Error("Invalid email or password");
  return { token: signToken(r.rows[0].id), user: { id: r.rows[0].id, email } };
}

export async function getUser(userId: string): Promise<User | null> {
  const r = await pool.query<{ email: string }>("SELECT email FROM users WHERE id=$1", [userId]);
  return r.rowCount ? { id: userId, email: r.rows[0].email } : null;
}
