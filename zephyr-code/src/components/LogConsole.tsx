import React, { useEffect, useRef, useState } from "react";
import { TerminalIcon, CheckIcon, SparklesIcon } from "./icons";

interface LogConsoleProps {
  logs: string[];
  isDone: boolean;
  onDismiss: () => void;
}

export default function LogConsole({ logs, isDone, onDismiss }: LogConsoleProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        {/* Top bar */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.pulseDotWrapper}>
              <span style={{ ...styles.pulseDot, background: isDone ? "#22c55e" : "#ff4e00" }}></span>
            </div>
            <div>
              <div style={styles.title}>
                {isDone ? "Environment Ready" : "Synthesizing Environment…"}
              </div>
              <div style={styles.subtitle}>
                {isDone ? "Launching workspace" : "Booting V8 sandbox & runtime container"}
              </div>
            </div>
          </div>

          <div style={styles.headerRight}>
            <button style={styles.ghostBtn} onClick={handleCopy}>
              {copied ? "Copied" : "Copy Logs"}
            </button>
            <button style={styles.actionBtn} onClick={onDismiss}>
              {isDone ? "Open Workspace →" : "Skip to Workspace"}
            </button>
          </div>
        </div>

        {/* Terminal Log Stream */}
        <div style={styles.terminalBody}>
          {logs.map((line, i) => {
            const isSuccess = line.startsWith("✅") || line.includes("ready") || line.includes("active");
            const isError = line.startsWith("❌") || line.includes("error");
            return (
              <div key={i} style={styles.logRow}>
                <span style={styles.timeTag}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    background: isSuccess
                      ? "rgba(34, 197, 94, 0.15)"
                      : isError
                      ? "rgba(239, 68, 68, 0.15)"
                      : "rgba(255, 78, 0, 0.14)",
                    color: isSuccess ? "#4ade80" : isError ? "#f87171" : "#ffb677",
                  }}
                >
                  {isSuccess ? "DONE" : isError ? "FAIL" : "EXEC"}
                </span>
                <span
                  style={{
                    ...styles.logText,
                    color: isSuccess
                      ? "#86efac"
                      : isError
                      ? "#fca5a5"
                      : "rgba(255, 255, 255, 0.85)",
                  }}
                >
                  {line}
                </span>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Footer Status */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <SparklesIcon size={14} style={{ color: "#ff8438" }} />
            <span>Hot-reloading & live compiler initialized</span>
          </div>
          <div style={styles.counter}>{logs.length} operations</div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  card: {
    width: "min(760px, 94vw)",
    height: "min(480px, 75vh)",
    background: "#0d0704",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    borderRadius: "16px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 70px rgba(0,0,0,0.7), 0 0 40px rgba(255,78,0,0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    background: "#120a06",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  pulseDotWrapper: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "rgba(255, 78, 0, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    boxShadow: "0 0 10px currentColor",
  },
  title: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#fff",
  },
  subtitle: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: "2px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  ghostBtn: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "rgba(255, 255, 255, 0.7)",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionBtn: {
    background: "linear-gradient(135deg, #ff4e00, #d93d00)",
    border: "1px solid rgba(255, 182, 119, 0.3)",
    color: "#fff",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(255, 78, 0, 0.3)",
  },
  terminalBody: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 18px",
    background: "#080402",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    lineHeight: 1.6,
  },
  logRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "3px 0",
  },
  timeTag: {
    color: "rgba(255, 255, 255, 0.2)",
    fontSize: "11px",
    userSelect: "none",
    width: "20px",
  },
  badge: {
    padding: "1px 6px",
    borderRadius: "4px",
    fontSize: "10px",
    fontWeight: 700,
    flexShrink: 0,
  },
  logText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  footer: {
    padding: "10px 20px",
    background: "#100905",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "11.5px",
    color: "rgba(255, 255, 255, 0.5)",
    flexShrink: 0,
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "rgba(255, 182, 119, 0.8)",
  },
  counter: {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
  },
};
