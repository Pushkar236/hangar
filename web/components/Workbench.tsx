"use client";

import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
  Power,
  Hexagon,
  FilePlus2,
  TerminalSquare,
} from "lucide-react";
import { HangarSession } from "@/lib/session";
import FileTree from "./FileTree";
import XTerm from "./XTerm";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
const LS_KEY = "hangar.sandboxId";

type Phase = "connecting" | "provisioning" | "ready" | "error" | "closed";

export default function Workbench({ auth, onExit }: { auth: string; onExit: () => void }) {
  const [session, setSession] = useState<HangarSession | null>(null);
  const [tabs, setTabs] = useState<string[]>(["t1"]);
  const [activeTab, setActiveTab] = useState("t1");
  const [phase, setPhase] = useState<Phase>("connecting");
  const [status, setStatus] = useState("Connecting…");
  const [resumed, setResumed] = useState(false);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewer, setViewer] = useState<{ path: string; content: string } | null>(null);
  const [gen, setGen] = useState(0);
  const nextNum = useRef(2);

  useEffect(() => {
    const resume = localStorage.getItem(LS_KEY) || undefined;
    const s = new HangarSession(WS_URL, auth, resume);
    setSession(s);
    setTabs(["t1"]);
    setActiveTab("t1");
    setViewer(null);
    setPhase("connecting");
    setStatus(resume ? "Resuming your project…" : "Connecting…");
    nextNum.current = 2;

    const off = s.on((m) => {
      if (m.type === "status") {
        setPhase("provisioning");
        setStatus(String(m.message ?? ""));
      } else if (m.type === "ready") {
        const id = m.sandboxId as string;
        localStorage.setItem(LS_KEY, id);
        setSandboxId(id);
        setResumed(Boolean(m.resumed));
        setPhase("ready");
        setStatus(m.resumed ? "Resumed project" : "New project");
      } else if (m.type === "fs.file") {
        setViewer({ path: m.path as string, content: m.content as string });
      } else if (m.type === "error") {
        setPhase("error");
        setStatus(`Error: ${m.message}`);
      } else if (m.type === "_closed") {
        setPhase("closed");
        setStatus("Disconnected — your project was saved");
      }
    });
    return () => {
      off();
      s.dispose();
    };
  }, [auth, gen]);

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
  const newProject = () => {
    if (!confirm("Start a new project? Your current one stays saved and can be reopened later from its sandbox ID."))
      return;
    localStorage.removeItem(LS_KEY);
    setGen((g) => g + 1);
  };

  const dotClass =
    phase === "ready" ? "ok" : phase === "error" || phase === "closed" ? "bad" : "wait";

  return (
    <div className="hg-app">
      <header className="hg-header">
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
        <div className="hg-header-right">
          <button className="hg-btn-ghost" onClick={newProject} title="New project">
            <FilePlus2 size={15} /> New
          </button>
          <button className="hg-btn-ghost" onClick={onExit} title="End session (project saved)">
            <Power size={15} /> End
          </button>
        </div>
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
                  key={`${gen}-${id}`}
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
            <span>{phase === "ready" ? (resumed ? "Resumed" : "Live") : status}</span>
            {sandboxId && <span className="hg-muted">sandbox {sandboxId.slice(0, 8)}…</span>}
            <span className="hg-muted hg-right">auto-saves on disconnect</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
