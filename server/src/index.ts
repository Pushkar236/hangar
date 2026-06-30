import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Sandbox } from "e2b";

/**
 * Hangar orchestrator.
 *
 * Bridges a browser terminal (xterm.js over a WebSocket) to an interactive
 * PTY inside an E2B sandbox that has Claude Code preinstalled. One WebSocket
 * connection == one terminal == one PTY. The user's Anthropic credential is
 * received over the (WSS) connection, injected into the sandbox env, and is
 * NEVER written to disk, persisted, or logged — session-only by design.
 *
 * This must run on a persistent host (Fly.io), NOT Vercel: it holds long-lived
 * WebSockets and manages sandbox lifecycles.
 */

const PORT = Number(process.env.PORT) || 8080;
// If a prebuilt template (with Claude Code baked in) is published, set
// E2B_TEMPLATE to its name to skip the per-session install. Otherwise we use
// the default `base` sandbox (Node + npm preinstalled) and install Claude Code
// at session start — no template build required for the MVP.
const CUSTOM_TEMPLATE =
  process.env.E2B_TEMPLATE && process.env.E2B_TEMPLATE !== "base"
    ? process.env.E2B_TEMPLATE
    : null;
// Cap a sandbox's life so an abandoned tab can't run up cost. Refreshed on
// activity via sandbox.setTimeout.
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 10 * 60 * 1000;

type ClientMessage =
  | { type: "start"; auth: string; cols?: number; rows?: number; autostart?: boolean }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

// A tiny HTTP server so hosts (Render/Fly/etc.) get a health endpoint; the
// WebSocket server shares the same port via the HTTP upgrade.
const httpServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
  let sandbox: Sandbox | null = null;
  let pid: number | null = null;
  let starting = false;
  let closed = false;

  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    const sb = sandbox;
    sandbox = null;
    pid = null;
    if (sb) {
      try {
        await sb.kill();
      } catch {
        /* best effort */
      }
    }
  };

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "start") {
      if (sandbox || starting) return;
      starting = true;
      const auth = String(msg.auth || "").trim();
      if (!auth) {
        send({ type: "error", message: "missing credential" });
        ws.close();
        return;
      }
      // Route the credential to the right env var WITHOUT ever logging it.
      // sk-ant-oat... = Claude subscription OAuth token; otherwise an API key.
      const envs: Record<string, string> = { TERM: "xterm-256color" };
      if (auth.startsWith("sk-ant-oat")) envs.CLAUDE_CODE_OAUTH_TOKEN = auth;
      else envs.ANTHROPIC_API_KEY = auth;

      try {
        sandbox = CUSTOM_TEMPLATE
          ? await Sandbox.create(CUSTOM_TEMPLATE, { timeoutMs: SANDBOX_TIMEOUT_MS })
          : await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS });
        // Install Claude Code on the default base template (skipped if a
        // prebuilt template already has it).
        if (!CUSTOM_TEMPLATE) {
          send({ type: "status", message: "Provisioning sandbox & installing Claude Code…" });
          await sandbox.commands.run("npm install -g @anthropic-ai/claude-code", {
            timeoutMs: 240_000,
          });
        }
        const handle = await sandbox.pty.create({
          cols: msg.cols ?? 80,
          rows: msg.rows ?? 24,
          envs,
          onData: (data: Uint8Array) =>
            send({ type: "data", data: Buffer.from(data).toString("base64") }),
        });
        pid = handle.pid;
        send({ type: "ready" });
        // Drop the user straight into Claude Code.
        if (msg.autostart !== false && pid != null) {
          await sandbox.pty.sendInput(pid, new TextEncoder().encode("claude\n"));
        }
      } catch (err) {
        // Log the real reason server-side (never contains the credential) and
        // surface a trimmed message to the client so failures are debuggable.
        console.error("[start] failed:", err);
        send({
          type: "error",
          message: `failed to start: ${String(err).slice(0, 300)}`,
        });
        await cleanup();
        ws.close();
      } finally {
        starting = false;
      }
      return;
    }

    if (!sandbox || pid == null) return;

    if (msg.type === "input") {
      try {
        await sandbox.pty.sendInput(pid, new TextEncoder().encode(msg.data));
        await sandbox.setTimeout(SANDBOX_TIMEOUT_MS); // keep-alive on activity
      } catch {
        /* ignore transient input errors */
      }
    } else if (msg.type === "resize") {
      try {
        await sandbox.pty.resize(pid, { cols: msg.cols, rows: msg.rows });
      } catch {
        /* ignore */
      }
    }
  });

  ws.on("close", () => void cleanup());
  ws.on("error", () => void cleanup());
});

httpServer.listen(PORT, () =>
  console.log(
    `hangar orchestrator listening on :${PORT} (template: ${CUSTOM_TEMPLATE ?? "base + runtime install"})`,
  ),
);
