"use client";

import { motion } from "framer-motion";
import { Hexagon, AlertTriangle } from "lucide-react";

const STEPS = ["Connecting", "Booting cloud sandbox", "Starting Claude Code"];

export default function BootOverlay({
  status,
  error,
  onRetry,
}: {
  status: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  let active = 0;
  if (/provision|resum|install/i.test(status)) active = 1;
  if (/launch|ready|live/i.test(status)) active = 2;

  return (
    <motion.div
      className="hg-boot"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="hg-aurora" />
      {error ? (
        <>
          <AlertTriangle size={44} style={{ color: "var(--red)" }} />
          <div className="hg-boot-status" style={{ color: "var(--red)", maxWidth: 360, textAlign: "center" }}>
            {status}
          </div>
          {onRetry && (
            <button className="hangar-btn" onClick={onRetry}>
              Reconnect
            </button>
          )}
        </>
      ) : (
        <>
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Hexagon size={48} fill="currentColor" className="hg-boot-logo" />
          </motion.div>
          <div className="hg-boot-status">{status}</div>
          <div className="hg-progress">
            <div className="hg-progress-bar" />
          </div>
          <div className="hg-boot-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`hg-step ${i < active ? "done" : i === active ? "active" : ""}`}>
                <span className="hg-step-dot" />
                {s}
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
