"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const Workbench = dynamic(() => import("@/components/Workbench"), { ssr: false });

export default function Home() {
  const [auth, setAuth] = useState("");
  const [started, setStarted] = useState(false);
  const valid = auth.startsWith("sk-ant-api") || auth.startsWith("sk-ant-oat");

  if (started) return <Workbench auth={auth} onExit={() => setStarted(false)} />;

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
          Launch Claude Code agent terminals in the cloud. Bring your own Claude key —
          it stays in memory for this session only and is never stored.
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
          Launch workbench
        </button>
        <p className="hangar-muted" style={{ marginTop: 16, fontSize: 12 }}>
          Your key is sent over an encrypted connection, injected into an isolated
          sandbox, and discarded when the session ends.
        </p>
      </div>
    </main>
  );
}
