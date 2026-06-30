import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { Sandbox } from "e2b";
import { pool, initDb } from "./db.js";
import { signup, login, getUser, verifyToken, userIdFromHeader } from "./auth.js";

/**
 * Hangar orchestrator (Phase 3).
 *
 * HTTP API (Express): email/password auth (JWT) + per-user projects.
 * WebSocket: JWT-gated, project-scoped. One connection == one project ==
 * one E2B sandbox; multiple PTYs (Claude agents) multiplexed by terminalId,
 * plus a file API. Sandboxes pause on disconnect (persist) and resume by id.
 */

const PORT = Number(process.env.PORT) || 8080;
const CUSTOM_TEMPLATE =
  process.env.E2B_TEMPLATE && process.env.E2B_TEMPLATE !== "base" ? process.env.E2B_TEMPLATE : null;
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 10 * 60 * 1000;
const HOME = "/home/user";
const CLAUDE_CONFIG = JSON.stringify({
  hasCompletedOnboarding: true,
  theme: "dark",
  projects: { [HOME]: { hasTrustDialogAccepted: true } },
});

// ── HTTP API ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.send("ok"));

app.post("/api/auth/signup", async (req, res) => {
  try {
    res.json(await signup(req.body?.email, req.body?.password));
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message || e) });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    res.json(await login(req.body?.email, req.body?.password));
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message || e) });
  }
});
app.get("/api/auth/me", async (req, res) => {
  const userId = userIdFromHeader(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  const user = await getUser(userId);
  return user ? res.json({ user }) : res.status(401).json({ error: "unauthorized" });
});

// Projects (all require auth)
app.use("/api/projects", (req, res, next) => {
  const userId = userIdFromHeader(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  (req as unknown as { userId: string }).userId = userId;
  next();
});
app.get("/api/projects", async (req, res) => {
  const userId = (req as unknown as { userId: string }).userId;
  const r = await pool.query(
    "SELECT id, name, sandbox_id, created_at, updated_at FROM projects WHERE user_id=$1 ORDER BY updated_at DESC",
    [userId],
  );
  res.json({ projects: r.rows });
});
app.post("/api/projects", async (req, res) => {
  const userId = (req as unknown as { userId: string }).userId;
  const name = String(req.body?.name || "Untitled").slice(0, 80);
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await pool.query("INSERT INTO projects (id, user_id, name) VALUES ($1,$2,$3)", [id, userId, name]);
  res.json({ project: { id, name, sandbox_id: null } });
});
app.delete("/api/projects/:id", async (req, res) => {
  const userId = (req as unknown as { userId: string }).userId;
  const r = await pool.query("SELECT sandbox_id FROM projects WHERE id=$1 AND user_id=$2", [
    req.params.id,
    userId,
  ]);
  if (r.rowCount) {
    const sid = r.rows[0].sandbox_id as string | null;
    if (sid) {
      try {
        const sb = await Sandbox.connect(sid);
        await sb.kill();
      } catch {
        /* already gone */
      }
    }
    await pool.query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [req.params.id, userId]);
  }
  res.json({ ok: true });
});

// ── WebSocket (project-scoped) ───────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

type ClientMessage =
  | { type: "start"; token: string; projectId: string; cols?: number; rows?: number }
  | { type: "open"; terminalId: string; cols?: number; rows?: number }
  | { type: "input"; terminalId: string; data: string }
  | { type: "resize"; terminalId: string; cols: number; rows: number }
  | { type: "close"; terminalId: string }
  | { type: "fs.list"; path?: string }
  | { type: "fs.read"; path: string };

wss.on("connection", (ws: WebSocket) => {
  let sandbox: Sandbox | null = null;
  let auth = ""; // not used for creds anymore — Claude auth comes from the env on the sandbox? see note
  let projectId = "";
  let starting = false;
  let closed = false;
  const pids = new Map<string, number>();

  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    const sb = sandbox;
    sandbox = null;
    pids.clear();
    if (sb) await sb.pause().catch(() => sb.kill().catch(() => {}));
  };
  const openTerminal = async (terminalId: string, cols: number, rows: number) => {
    if (!sandbox || pids.has(terminalId)) return;
    const handle = await sandbox.pty.create({
      cols,
      rows,
      envs: auth.startsWith("sk-ant-oat")
        ? { TERM: "xterm-256color", CLAUDE_CODE_OAUTH_TOKEN: auth }
        : { TERM: "xterm-256color", ANTHROPIC_API_KEY: auth },
      onData: (data: Uint8Array) =>
        send({ type: "data", terminalId, data: Buffer.from(data).toString("base64") }),
    });
    pids.set(terminalId, handle.pid);
    send({ type: "terminalReady", terminalId });
    await sandbox.pty.sendInput(handle.pid, new TextEncoder().encode("claude\n"));
  };

  ws.on("message", async (raw) => {
    let msg: ClientMessage & { auth?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      if (msg.type === "start") {
        if (sandbox || starting) return;
        starting = true;
        const userId = verifyToken(msg.token);
        // The Claude credential still rides along (session-only) for the agent.
        auth = String(msg.auth || "").trim();
        if (!userId) {
          send({ type: "error", message: "unauthorized" });
          ws.close();
          starting = false;
          return;
        }
        const pr = await pool.query<{ sandbox_id: string | null }>(
          "SELECT sandbox_id FROM projects WHERE id=$1 AND user_id=$2",
          [msg.projectId, userId],
        );
        if (!pr.rowCount) {
          send({ type: "error", message: "project not found" });
          ws.close();
          starting = false;
          return;
        }
        projectId = msg.projectId;
        try {
          const existing = pr.rows[0].sandbox_id;
          let resumed = false;
          if (existing) {
            send({ type: "status", message: "Resuming your project…" });
            try {
              sandbox = await Sandbox.connect(existing, { timeoutMs: SANDBOX_TIMEOUT_MS });
              resumed = true;
            } catch {
              sandbox = null;
            }
          }
          if (!sandbox) {
            send({ type: "status", message: "Provisioning sandbox & installing Claude Code…" });
            sandbox = CUSTOM_TEMPLATE
              ? await Sandbox.create(CUSTOM_TEMPLATE, { timeoutMs: SANDBOX_TIMEOUT_MS })
              : await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS });
            if (!CUSTOM_TEMPLATE) {
              await sandbox.commands.run("npm install -g @anthropic-ai/claude-code", {
                timeoutMs: 240_000,
              });
            }
            await sandbox.files.write(`${HOME}/.claude.json`, CLAUDE_CONFIG).catch(() => {});
          }
          await pool.query(
            "UPDATE projects SET sandbox_id=$1, updated_at=now() WHERE id=$2",
            [sandbox.sandboxId, projectId],
          );
          send({ type: "ready", sandboxId: sandbox.sandboxId, resumed });
          await openTerminal("t1", msg.cols ?? 80, msg.rows ?? 24);
        } catch (err) {
          console.error("[start] failed:", err);
          send({ type: "error", message: `failed to start: ${String(err).slice(0, 300)}` });
          await cleanup();
          ws.close();
        } finally {
          starting = false;
        }
        return;
      }

      if (!sandbox) return;

      switch (msg.type) {
        case "open":
          await openTerminal(msg.terminalId, msg.cols ?? 80, msg.rows ?? 24);
          await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
          break;
        case "input": {
          const pid = pids.get(msg.terminalId);
          if (pid != null) {
            await sandbox.pty.sendInput(pid, new TextEncoder().encode(msg.data));
            await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
          }
          break;
        }
        case "resize": {
          const pid = pids.get(msg.terminalId);
          if (pid != null) await sandbox.pty.resize(pid, { cols: msg.cols, rows: msg.rows });
          break;
        }
        case "close": {
          const pid = pids.get(msg.terminalId);
          if (pid != null) {
            pids.delete(msg.terminalId);
            await sandbox.pty.kill(pid).catch(() => {});
          }
          break;
        }
        case "fs.list": {
          const path = msg.path || HOME;
          const entries = await sandbox.files.list(path);
          send({
            type: "fs.dir",
            path,
            entries: entries
              .map((e) => ({ name: e.name, path: e.path, dir: e.type === "dir" }))
              .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)),
          });
          break;
        }
        case "fs.read": {
          const content = await sandbox.files.read(msg.path);
          send({ type: "fs.file", path: msg.path, content: String(content).slice(0, 200_000) });
          break;
        }
      }
    } catch (err) {
      send({ type: "error", message: String(err).slice(0, 200) });
    }
  });

  ws.on("close", () => void cleanup());
  ws.on("error", () => void cleanup());
});

initDb()
  .then(() => httpServer.listen(PORT, () => console.log(`hangar listening on :${PORT}`)))
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });
