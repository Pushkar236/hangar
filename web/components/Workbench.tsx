"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { AnimatePresence } from "framer-motion";
import { PanelLeft, Plus, X, ArrowLeft, Hexagon, TerminalSquare } from "lucide-react";
import { HangarSession } from "@/lib/session";
import FileTree from "./FileTree";
import XTerm from "./XTerm";
import Editor, { type OpenFile } from "./Editor";
import BootOverlay from "./BootOverlay";

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
  const [phase, setPhase] = useState<Phase>("connecting");
  const [status, setStatus] = useState("Connecting…");
  const [sandboxId, setSandboxId] = useState<string | null>(null);

  // terminals (agents)
  const [tabs, setTabs] = useState<string[]>(["t1"]);
  const [activeTab, setActiveTab] = useState("t1");
  const nextNum = useRef(2);

  // editor
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const openFilesRef = useRef<OpenFile[]>([]);
  openFilesRef.current = openFiles;
  const activePathRef = useRef<string | null>(null);
  activePathRef.current = activePath;

  const sideRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    const s = new HangarSession(WS_URL, { token, projectId, claudeKey });
    setSession(s);
    const off = s.on((m) => {
      if (m.type === "status") {
        setPhase("provisioning");
        setStatus(String(m.message ?? ""));
      } else if (m.type === "ready") {
        setSandboxId(m.sandboxId as string);
        setPhase("ready");
        setStatus(m.resumed ? "Resumed" : "Live");
      } else if (m.type === "fs.file") {
        const path = m.path as string;
        const content = m.content as string;
        setOpenFiles((prev) =>
          prev.some((f) => f.path === path)
            ? prev.map((f) => (f.path === path ? { ...f, content, dirty: false } : f))
            : [...prev, { path, content, dirty: false }],
        );
        setActivePath(path);
      } else if (m.type === "fs.saved") {
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === m.path ? { ...f, dirty: false } : f)),
        );
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

  // Ctrl/Cmd+S saves the active file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const p = activePathRef.current;
        const f = openFilesRef.current.find((x) => x.path === p);
        if (f && session) {
          session.writeFile(f.path, f.content);
          setOpenFiles((prev) => prev.map((x) => (x.path === f.path ? { ...x, dirty: false } : x)));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const openFile = (path: string) => {
    if (openFiles.some((f) => f.path === path)) setActivePath(path);
    else session?.readFile(path);
  };
  const closeFile = (path: string) =>
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activePath === path) setActivePath(next.length ? next[next.length - 1].path : null);
      return next;
    });
  const changeFile = (path: string, v: string) =>
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: v, dirty: true } : f)));
  const saveFile = (path: string) => {
    const f = openFiles.find((x) => x.path === path);
    if (f && session) {
      session.writeFile(path, f.content);
      setOpenFiles((prev) => prev.map((x) => (x.path === path ? { ...x, dirty: false } : x)));
    }
  };

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

  const dotClass = phase === "ready" ? "ok" : phase === "error" || phase === "closed" ? "bad" : "wait";
  const toggleSide = () => {
    const p = sideRef.current;
    if (p) (p.isCollapsed() ? p.expand() : p.collapse());
  };

  return (
    <div className="hg-app">
      <AnimatePresence>
        {phase !== "ready" && <BootOverlay status={status} error={phase === "error"} />}
      </AnimatePresence>
      <header className="hg-header">
        <button className="hg-icon-btn" onClick={onExit} title="Back to projects">
          <ArrowLeft size={18} />
        </button>
        <button className="hg-icon-btn" onClick={toggleSide} title="Toggle explorer">
          <PanelLeft size={18} />
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

      <PanelGroup direction="horizontal" className="hg-body" autoSaveId="hg-layout-h">
        <Panel ref={sideRef} collapsible defaultSize={18} minSize={12} maxSize={32} collapsedSize={0} order={1}>
          <aside className="hg-sidebar">
            {session && <FileTree session={session} onOpenFile={openFile} />}
          </aside>
        </Panel>
        <PanelResizeHandle className="hg-rh" />
        <Panel order={2}>
          <PanelGroup direction="vertical" autoSaveId="hg-layout-v">
            <Panel defaultSize={60} minSize={0}>
              <Editor
                files={openFiles}
                activePath={activePath}
                onActivate={setActivePath}
                onClose={closeFile}
                onChange={changeFile}
                onSave={saveFile}
              />
            </Panel>
            <PanelResizeHandle className="hg-rh hg-rh-h" />
            <Panel defaultSize={40} minSize={12}>
              <div className="hg-term-wrap">
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
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      <footer className="hg-statusbar">
        <span className={`hg-dot ${dotClass}`} />
        <span>{status}</span>
        {sandboxId && <span className="hg-muted">sandbox {sandboxId.slice(0, 8)}…</span>}
        <span className="hg-muted hg-right">⌘/Ctrl+S to save · auto-saves on disconnect</span>
      </footer>
    </div>
  );
}
