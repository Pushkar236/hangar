"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
      <div className="hg-aurora" />
      <motion.div
        className="hg-card"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: 400, padding: 34 }}
      >
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ display: "inline-block" }}
          >
            <Hexagon size={42} fill="currentColor" className="hg-boot-logo" />
          </motion.div>
          <h1 style={{ fontSize: 25, fontWeight: 800, margin: "14px 0 4px", letterSpacing: "-0.02em" }}>
            {mode === "login" ? "Sign in to Hangar" : "Create your account"}
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
          {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
          <button className="hangar-btn" disabled={busy} type="submit">
            {busy ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span className="hg-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </span>
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
          {busy && slow && (
            <p className="hangar-muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
              Waking the cloud server — first request can take up to a minute on the free tier.
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
            style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontSize: 13 }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </motion.div>
    </main>
  );
}
