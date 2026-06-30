import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Sandbox } from "e2b";

/**
 * Hangar orchestrator (Phase 2).
 *
 * One WebSocket connection == one project == one E2B sandbox. Within that
 * sandbox the client can open MULTIPLE terminals (tabs) — each a PTY running
 * Claude Code — multiplexed over the single socket by `terminalId`. The client
 * can also browse the sandbox filesystem (the file tree).
 *
 * The user's Anthropic credential is received over WSS, injected into the
 * sandbox env, and is NEVER persisted or logged (session-only).
 */

const PORT = Number(process.env.PORT) || 8080;
const CUSTOM_TEMPLATE =
  process.env.E2B_TEMPLATE && process.env.E2B_TEMPLATE !== "base"
    ? process.env.E2B_TEMPLATE
    : null;
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 10 * 60 * 1000;
const HOME = "/home/user";

// Pre-seed so Claude Code skips onboarding + the trust dialog (lands at prompt).
const CLAUDE_CONFIG = JSON.stringify({
  hasCompletedOnboarding: true,
  theme: "dark",
  projects: { [HOME]: { hasTrustDialogAccepted: true } },
});

type ClientMessage =
  | { type: "start"; auth: string; cols?: number; rows?: number }
  | { type: "open"; terminalId: string; cols?: number; rows?: number }
  | { type: "input"; terminalId: string; data: string }
  | { type: "resize"; terminalId: string; cols: number; rows: number }
  | { type: "close"; terminalId: string }
  | { type: "fs.list"; path?: string }
  | { type: "fs.read"; path: string };

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
  let auth = "";
  let starting = false;
  let closed = false;
  const pids = new Map<string, number>(); // terminalId -> pty pid

  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    const sb = sandbox;
    sandbox = null;
    pids.clear();
    if (sb) await sb.kill().catch(() => {});
  };

  // Open one PTY (a Claude Code agent) in the sandbox, tagged by terminalId.
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
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      if (msg.type === "start") {
        if (sandbox || starting) return;
        starting = true;
        auth = String(msg.auth || "").trim();
        if (!auth) {
          send({ type: "error", message: "missing credential" });
          ws.close();
          return;
        }
        try {
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
          send({ type: "ready", sandboxId: sandbox.sandboxId });
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

httpServer.listen(PORT, () =>
  console.log(
    `hangar orchestrator listening on :${PORT} (template: ${CUSTOM_TEMPLATE ?? "base + runtime install"})`,
  ),
);
