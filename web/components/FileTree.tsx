"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, RefreshCw } from "lucide-react";
import type { HangarSession } from "@/lib/session";

const HOME = "/home/user";
type Entry = { name: string; path: string; dir: boolean };

export default function FileTree({
  session,
  onOpenFile,
}: {
  session: HangarSession;
  onOpenFile: (path: string) => void;
}) {
  const [byDir, setByDir] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([HOME]));

  useEffect(() => {
    const off = session.on((m) => {
      if (m.type === "fs.dir") {
        setByDir((prev) => ({ ...prev, [m.path as string]: (m.entries as Entry[]) ?? [] }));
      }
    });
    session.listDir(HOME);
    return off;
  }, [session]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        if (!byDir[path]) session.listDir(path);
      }
      return next;
    });
  };

  const renderDir = (path: string, depth: number) => {
    const entries = byDir[path];
    if (!entries) return <div style={{ paddingLeft: depth * 12 + 12 }} className="hg-tree-muted">…</div>;
    return entries.map((e) => {
      const isOpen = expanded.has(e.path);
      return (
        <div key={e.path}>
          <button
            className="hg-tree-row"
            style={{ paddingLeft: depth * 12 + 8 }}
            onClick={() => (e.dir ? toggle(e.path) : onOpenFile(e.path))}
          >
            {e.dir ? (
              isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />
            ) : (
              <span style={{ width: 13, display: "inline-block" }} />
            )}
            {e.dir ? <Folder size={13} /> : <File size={13} />}
            <span className="hg-tree-name">{e.name}</span>
          </button>
          {e.dir && isOpen && renderDir(e.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="hg-tree">
      <div className="hg-tree-head">
        <span>Files</span>
        <button
          className="hg-icon-btn"
          title="Refresh"
          onClick={() => {
            setByDir({});
            session.listDir(HOME);
            expanded.forEach((p) => p !== HOME && session.listDir(p));
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="hg-tree-body">{renderDir(HOME, 0)}</div>
    </div>
  );
}
