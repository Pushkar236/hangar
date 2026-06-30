"use client";

import { Editor as Monaco } from "@monaco-editor/react";
import { X, Save } from "lucide-react";

export type OpenFile = { path: string; content: string; dirty: boolean };

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", json: "json", md: "markdown",
  css: "css", scss: "scss", html: "html", py: "python", go: "go", rs: "rust",
  java: "java", c: "c", cpp: "cpp", h: "cpp", sh: "shell", bash: "shell",
  yml: "yaml", yaml: "yaml", toml: "ini", sql: "sql", php: "php", rb: "ruby",
  vue: "html", svelte: "html", dockerfile: "dockerfile",
};
const langFor = (p: string) => LANG[p.split(".").pop()?.toLowerCase() || ""] || "plaintext";

export default function Editor({
  files,
  activePath,
  onActivate,
  onClose,
  onChange,
  onSave,
}: {
  files: OpenFile[];
  activePath: string | null;
  onActivate: (p: string) => void;
  onClose: (p: string) => void;
  onChange: (p: string, v: string) => void;
  onSave: (p: string) => void;
}) {
  const active = files.find((f) => f.path === activePath) || null;

  return (
    <div className="hg-editor">
      <div className="hg-etabs">
        {files.map((f) => (
          <div
            key={f.path}
            className={`hg-etab ${f.path === activePath ? "active" : ""}`}
            onClick={() => onActivate(f.path)}
            title={f.path}
          >
            <span className={f.dirty ? "hg-dirty" : ""}>{f.path.split("/").pop()}</span>
            {f.dirty && <span className="hg-dirty-dot" />}
            <button
              className="hg-tab-x"
              onClick={(e) => {
                e.stopPropagation();
                onClose(f.path);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {active?.dirty && (
          <button className="hg-save-btn" onClick={() => onSave(active.path)} title="Save (Ctrl+S)">
            <Save size={13} /> Save
          </button>
        )}
      </div>
      <div className="hg-editor-body">
        {active ? (
          <Monaco
            height="100%"
            theme="vs-dark"
            path={active.path}
            language={langFor(active.path)}
            value={active.content}
            onChange={(v) => onChange(active.path, v ?? "")}
            options={{
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 10 },
              tabSize: 2,
            }}
          />
        ) : (
          <div className="hg-editor-empty">
            <p>Open a file from the explorer to edit it.</p>
            <p className="hangar-muted" style={{ fontSize: 12 }}>
              Your agents edit files in the terminal below — changes show here when you reopen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
