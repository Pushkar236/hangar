"use client";

import { useEffect, useState } from "react";
import { Hexagon, Plus, Trash2, LogOut, FolderGit2, ArrowRight } from "lucide-react";
import { api, clearToken, type Project } from "@/lib/api";

export default function Projects({
  user,
  onOpen,
  onLogout,
}: {
  user: { email: string };
  onOpen: (projectId: string, claudeKey: string) => void;
  onLogout: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [target, setTarget] = useState<Project | null>(null); // key modal
  const [claudeKey, setClaudeKey] = useState("");

  const load = () =>
    api
      .listProjects()
      .then((d) => setProjects(d.projects))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await api.createProject(name);
    setNewName("");
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this project and its sandbox? This cannot be undone.")) return;
    await api.deleteProject(id);
    load();
  };

  const keyValid = claudeKey.startsWith("sk-ant-api") || claudeKey.startsWith("sk-ant-oat");

  return (
    <main className="hg-dash">
      <header className="hg-dash-head">
        <span className="hg-brand">
          <Hexagon size={18} fill="currentColor" />
          Hangar
        </span>
        <span className="hangar-muted" style={{ marginLeft: "auto" }}>
          {user.email}
        </span>
        <button className="hg-btn-ghost" onClick={() => { clearToken(); onLogout(); }}>
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <div className="hg-dash-body">
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Your projects</h1>
        <p className="hangar-muted" style={{ margin: "0 0 20px" }}>
          Each project is a persistent cloud sandbox running Claude Code.
        </p>

        <form onSubmit={create} className="hg-newproj">
          <input
            className="hangar-input"
            placeholder="New project name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="hangar-btn" type="submit" style={{ whiteSpace: "nowrap" }}>
            <Plus size={16} style={{ verticalAlign: "-3px" }} /> Create
          </button>
        </form>

        {loading ? (
          <p className="hangar-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="hangar-muted">No projects yet — create one above.</p>
        ) : (
          <div className="hg-proj-list">
            {projects.map((p) => (
              <div key={p.id} className="hg-proj">
                <FolderGit2 size={18} style={{ color: "#1d9bf0", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div className="hangar-muted" style={{ fontSize: 12 }}>
                    {p.sandbox_id ? "saved · resumes on open" : "new"}
                  </div>
                </div>
                <button className="hg-icon-btn" title="Delete" onClick={() => remove(p.id)}>
                  <Trash2 size={15} />
                </button>
                <button className="hangar-btn" style={{ padding: "8px 16px", fontSize: 14 }} onClick={() => setTarget(p)}>
                  Open <ArrowRight size={15} style={{ verticalAlign: "-3px" }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <div className="hg-modal-bg" onClick={() => setTarget(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Open “{target.name}”</h2>
            <p className="hangar-muted" style={{ margin: "0 0 16px" }}>
              Paste your Claude key — session-only, never stored.
            </p>
            <input
              className="hangar-input"
              type="password"
              placeholder="sk-ant-api… or sk-ant-oat…"
              value={claudeKey}
              autoFocus
              onChange={(e) => setClaudeKey(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyValid) onOpen(target.id, claudeKey);
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="hg-btn-ghost" onClick={() => setTarget(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="hangar-btn"
                disabled={!keyValid}
                style={{ flex: 1 }}
                onClick={() => onOpen(target.id, claudeKey)}
              >
                Launch
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
