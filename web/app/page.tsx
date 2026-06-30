"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// xterm touches the DOM, so load the terminal client-only.
const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export default function Home() {
  const [auth, setAuth] = useState("");
  const [started, setStarted] = useState(false);

  const valid =
    auth.startsWith("sk-ant-api") || auth.startsWith("sk-ant-oat");

  if (started) {
    return (
      <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #2f3336",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <strong>Hangar</strong>
          <span className="hangar-muted">Claude Code · 1 terminal</span>
          <button
            className="hangar-btn"
            style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 13 }}
            onClick={() => setStarted(false)}
          >
            End session
          </button>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Terminal auth={auth} wsUrl={WS_URL} />
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px" }}>Hangar</h1>
        <p className="hangar-muted" style={{ margin: "0 0 24px" }}>
          Launch a Claude Code agent terminal in the cloud. Bring your own Claude
          key — it stays in memory for this session only and is never stored.
        </p>
        <label className="hangar-muted" style={{ display: "block", marginBottom: 6 }}>
          Anthropic API key (sk-ant-api…) or OAuth token (sk-ant-oat…)
        </label>
        <input
          className="hangar-input"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={auth}
          onChange={(e) => setAuth(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) setStarted(true);
          }}
        />
        <button
          className="hangar-btn"
          style={{ width: "100%", marginTop: 16 }}
          disabled={!valid}
          onClick={() => setStarted(true)}
        >
          Launch terminal
        </button>
        <p className="hangar-muted" style={{ marginTop: 16, fontSize: 12 }}>
          Your key is sent over an encrypted connection to the orchestrator,
          injected into an isolated sandbox, and discarded when the session ends.
        </p>
      </div>
    </main>
  );
}
