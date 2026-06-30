# Hangar

Launch **Claude Code agent terminals in the cloud**. Bring your own Claude key,
spin up terminal instances that each run Claude Code, and build your project —
Replit-like, but agent-centric. Users pay Anthropic for inference via their own
key; you (the operator) host the UI + orchestration.

> Phase 1 (this scaffold): paste your key → **one** real Claude Code terminal in
> the browser. Multi-terminal, persistence, accounts, and scale come next.

## Architecture

```
Browser (xterm.js)
   │  WSS
   ▼
web/      Next.js frontend            → Vercel       (UI, key entry; no terminals)
   │  WSS (PTY stream)
   ▼
server/   WebSocket orchestrator      → Fly.io       (persistent; bridges to E2B)
   │  e2b SDK
   ▼
sandbox/  E2B template (Claude Code)  → E2B          (isolated PTY per terminal)
```

Vercel can't run persistent PTYs/WebSockets, so the orchestrator lives on Fly.io
and drives [E2B](https://e2b.dev) sandboxes.

## Repo layout
- `web/` — Next.js 15 frontend (Vercel). Terminal UI + key entry.
- `server/` — Node WebSocket orchestrator (Fly.io). PTY⇄WS⇄E2B bridge.
- `sandbox/` — E2B template (`e2b.Dockerfile`) with Claude Code preinstalled.

## Security model
- The Claude credential is **session-only**: received over WSS, injected into the
  sandbox env, **never written to disk/DB and never logged**. Re-entered each session.
- API keys (`sk-ant-api…`) → `ANTHROPIC_API_KEY`. Subscription OAuth tokens
  (`sk-ant-oat…`) → `CLAUDE_CODE_OAUTH_TOKEN`. (For a public launch, re-confirm
  Anthropic's ToS on using subscription tokens in a hosted product.)
- Untrusted user code only ever runs inside the isolated E2B sandbox — never on
  the orchestrator host.
- Sandboxes auto-expire (`SANDBOX_TIMEOUT_MS`, refreshed on activity) to bound cost.

## Local development
Prereqs: Node 22+, an [E2B API key](https://e2b.dev/dashboard), the E2B CLI
(`npm i -g @e2b/cli`).

```bash
# 1) Build the sandbox template (once)
cd sandbox
e2b template build --name hangar-claude-code --dockerfile e2b.Dockerfile

# 2) Orchestrator
cd ../server
cp ../.env.example .env   # set E2B_API_KEY + E2B_TEMPLATE
npm install
npm run dev               # ws://localhost:8080

# 3) Frontend
cd ../web
npm install
# NEXT_PUBLIC_WS_URL defaults to ws://localhost:8080
npm run dev               # http://localhost:3000
```

Open the web app, paste a Claude key, and you get a live Claude Code terminal.

## Deploy
- **Frontend → Vercel:** new project, root directory `web/`, set
  `NEXT_PUBLIC_WS_URL=wss://<your-fly-app>.fly.dev`.
- **Orchestrator → Fly.io:** `cd server && fly launch --no-deploy` then
  `fly secrets set E2B_API_KEY=… E2B_TEMPLATE=hangar-claude-code` then `fly deploy`.
- **Sandbox → E2B:** build/publish the template (above) before first run.

## Roadmap
- **Phase 2:** multiple terminals per project, file tree, persistence.
- **Phase 3:** accounts + the "agent control room" live view.
- **Phase 4:** multi-tenant hardening, quotas, optional billing.

See [`../OnGo/plans/agent-workbench-plan.md`](../OnGo/plans/agent-workbench-plan.md)
for the full plan.
