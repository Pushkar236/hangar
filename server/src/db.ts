import { Pool } from "pg";

// Neon's pooled URL includes channel_binding=require, which node-pg's SCRAM
// doesn't negotiate — strip it and force SSL.
const url = (process.env.DATABASE_URL || "")
  .replace("&channel_binding=require", "")
  .replace("channel_binding=require&", "")
  .replace("?channel_binding=require", "");

export const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

/** Create tables if they don't exist (run on boot + via a migrate script). */
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      sandbox_id  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id);
  `);
}
