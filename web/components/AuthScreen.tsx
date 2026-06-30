"use client";

import { useEffect, useState } from "react";
import { Hexagon } from "lucide-react";
import { api, setToken, warmUp } from "@/lib/api";

export default function AuthScreen({
  onAuthed,
}: {
  onAuthed: (u: { id: string; email: string }) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  // Wake the free-tier server as soon as the screen loads, so it's warm by the
  // time the user submits (avoids the "stuck button" cold-start feeling).
  useEffect(() => {
    warmUp();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const r = mode === "login" ? await api.login(email, password) : await api.signup(email, password);
      setToken(r.token);
      clearTimeout(slowTimer);
      onAuthed(r.user);
    } catch (e) {
      clearTimeout(slowTimer);
      setSlow(false);
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  }

  return (
    <main className="hg-center">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <Hexagon size={40} fill="currentColor" style={{ color: "#1d9bf0" }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 4px" }}>
            {mode === "login" ? "Sign in to Hangar" : "Create your Hangar account"}
          </h1>
          <p className="hangar-muted">Cloud Claude Code agent terminals.</p>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="hangar-input"
            type="email"
            placeholder="you@email.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="hangar-input"
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <p style={{ color: "#f4212e", fontSize: 13, margin: 0 }}>{err}</p>}
          <button className="hangar-btn" disabled={busy} type="submit">
            {busy
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
          {busy && slow && (
            <p className="hangar-muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
              Waking the cloud server — the first request can take up to a minute
              on the free tier. Hang tight…
            </p>
          )}
        </form>
        <p className="hangar-muted" style={{ textAlign: "center", marginTop: 18 }}>
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setErr("");
            }}
            style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer", fontSize: 13 }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
