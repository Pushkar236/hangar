"use client";

import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
  ArrowLeft,
  Hexagon,
  TerminalSquare,
} from "lucide-react";
import { HangarSession } from "@/lib/session";
import FileTree from "./FileTree";
import XTerm from "./XTerm";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
type Phase = "connecting" | "provisioning" | "ready" | "error" | "closed";

export default function Workbench({
  token,
  projectId,
  claudeKey,
  onExit,
}: {
  token: string;
  projectId: string;
  claudeKey: string;
  onExit: () => void;
}) {
  const [session, setSession] = useState<HangarSession | null>(null);
  const [tabs, setTabs] = useState<string[]>(["t1"]);
  const [activeTab, setActiveTab] = useState("t1");
  const [phase, setPhase] = useState<Phase>("connecting");
  const [status, setStatus] = useState("Connecting…");
  const [resumed, setResumed] = useState(false);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewer, setViewer] = useState<{ path: string; content: string } | null>(null);
  const nextNum = useRef(2);

  useEffect(() => {
    const s = new HangarSession(WS_URL, { token, projectId, claudeKey });
    setSession(s);
    const off = s.on((m) => {
      if (m.type === "status") {
        setPhase("provisioning");
        setStatus(String(m.message ?? ""));
      } else if (m.type === "ready") {
        setSandboxId(m.sandboxId as string);
        setResumed(Boolean(m.resumed));
        setPhase("ready");
        setStatus(m.resumed ? "Resumed" : "Live");
      } else if (m.type === "fs.file") {
        setViewer({ path: m.path as string, content: m.content as string });
      } else if (m.type === "error") {
        setPhase("error");
        setStatus(`Error: ${m.message}`);
      } else if (m.type === "_closed") {
        setPhase("closed");
        setStatus("Disconnected — project saved");
      }
    });
    return () => {
      off();
      s.dispose();
    };
  }, [token, projectId, claudeKey]);

  const addTab = () => {
    const id = `t${nextNum.current++}`;
    setTabs((t) => [...t, id]);
    setActiveTab(id);
  };
  const closeTab = (id: string) => {
    if (!session || tabs.length === 1) return;
    session.closeTerminal(id);
    setTabs((t) => {
      const next = t.filter((x) => x !== id);
      if (activeTab === id) setActiveTab(next[next.length - 1]);
      return next;
    });
  };

  const dotClass =
    phase === "ready" ? "ok" : phase === "error" || phase === "closed" ? "bad" : "wait";

  return (
    <div className="hg-app">
      <header className="hg-header">
        <button className="hg-icon-btn" onClick={onExit} title="Back to projects">
          <ArrowLeft size={18} />
        </button>
        <button className="hg-icon-btn" onClick={() => setSidebarOpen((v) => !v)} title="Toggle files">
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <span className="hg-brand">
          <Hexagon size={18} fill="currentColor" />
          Hangar
        </span>
        <span className={`hg-pill ${dotClass}`}>
          <span className="hg-dot" />
          {status}
        </span>
      </header>

      <div className="hg-body">
        {sidebarOpen && (
          <aside className="hg-sidebar">
            {session && <FileTree session={session} onOpenFile={(p) => session.readFile(p)} />}
          </aside>
        )}

        <main className="hg-main">
          <div className="hg-tabs">
            {tabs.map((id) => (
              <div
                key={id}
                className={`hg-tab ${id === activeTab ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <TerminalSquare size={13} />
                <span>agent {id.slice(1)}</span>
                {tabs.length > 1 && (
                  <button
                    className="hg-tab-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(id);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <button className="hg-icon-btn" onClick={addTab} title="New agent terminal">
              <Plus size={16} />
            </button>
          </div>

          <div className="hg-term-stack">
            {session &&
              tabs.map((id) => (
                <XTerm
                  key={id}
                  session={session}
                  terminalId={id}
                  active={id === activeTab}
                  autoOpen={id !== "t1"}
                />
              ))}
            {viewer && (
              <div className="hg-viewer">
                <div className="hg-viewer-head">
                  <span className="hg-muted">{viewer.path}</span>
                  <button className="hg-icon-btn" onClick={() => setViewer(null)}>
                    <X size={14} />
                  </button>
                </div>
                <pre className="hg-viewer-body">{viewer.content}</pre>
              </div>
            )}
          </div>

          <footer className="hg-statusbar">
            <span className={`hg-dot ${dotClass}`} />
            <span>{status}</span>
            {sandboxId && <span className="hg-muted">sandbox {sandboxId.slice(0, 8)}…</span>}
            <span className="hg-muted hg-right">auto-saves on disconnect</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
