"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/**
 * A single browser terminal wired to the orchestrator over a WebSocket. The
 * orchestrator opens a PTY in an E2B sandbox running Claude Code and streams it
 * here. The Anthropic credential is sent once on connect and never stored.
 */
export default function Terminal({
  auth,
  wsUrl,
}: {
  auth: string;
  wsUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#000000", foreground: "#e7e9ea" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    term.writeln("\x1b[90m[hangar] connecting…\x1b[0m");

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "start",
          auth,
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    ws.onmessage = (ev) => {
      let msg: { type: string; data?: string; message?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "data" && msg.data) {
        const bytes = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
        term.write(bytes);
      } else if (msg.type === "ready") {
        term.writeln("\x1b[90m[hangar] sandbox ready\x1b[0m");
      } else if (msg.type === "error") {
        term.writeln(`\r\n\x1b[31m[hangar] ${msg.message ?? "error"}\x1b[0m`);
      }
    };

    ws.onclose = () =>
      term.writeln("\r\n\x1b[90m[hangar] session closed\x1b[0m");

    const onData = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "input", data: d }));
    });
    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });

    const handleResize = () => fit.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      onData.dispose();
      onResize.dispose();
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [auth, wsUrl]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%", padding: 8 }} />;
}
