"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTermClass } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { HangarSession } from "@/lib/session";

/**
 * One xterm bound to a terminalId on the shared session. The server opens "t1"
 * automatically on start; other tabs call session.openTerminal(id) first.
 */
export default function XTerm({
  session,
  terminalId,
  active,
  autoOpen,
}: {
  session: HangarSession;
  terminalId: string;
  active: boolean;
  autoOpen: boolean; // true for tabs we must open ourselves (not the server's t1)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const term = new XTermClass({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#000000", foreground: "#e7e9ea" },
    });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(el);
    try {
      fit.fit();
    } catch {
      /* not visible yet */
    }

    session.onData(terminalId, (b64) =>
      term.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))),
    );
    const onData = term.onData((d) => session.input(terminalId, d));
    const onResize = term.onResize(({ cols, rows }) =>
      session.resize(terminalId, cols, rows),
    );

    if (autoOpen) session.openTerminal(terminalId, term.cols, term.rows);
    else session.resize(terminalId, term.cols, term.rows); // sync server's t1 size

    const refit = () => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    };
    window.addEventListener("resize", refit);
    // Re-fit when the terminal panel itself is resized (drag handles).
    const ro = new ResizeObserver(refit);
    ro.observe(el);

    return () => {
      window.removeEventListener("resize", refit);
      ro.disconnect();
      onData.dispose();
      onResize.dispose();
      session.offData(terminalId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit when this tab becomes active (xterm can't size while display:none).
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* noop */
        }
      }, 30);
      return () => clearTimeout(t);
    }
  }, [active]);

  return (
    <div
      ref={ref}
      style={{ height: "100%", width: "100%", display: active ? "block" : "none", padding: 8 }}
    />
  );
}
