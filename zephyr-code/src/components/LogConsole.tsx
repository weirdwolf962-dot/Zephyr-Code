import { useEffect, useRef, useState } from "react";

interface LogConsoleProps {
  logs: string[];
  isDone: boolean;
  onDismiss: () => void;
}

// Styled after StackBlitz/bolt.new-style build consoles: a docked panel
// with source/kind tag chips per line, a running count, and dismiss controls.
export default function LogConsole({ logs, isDone, onDismiss }: LogConsoleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, collapsed]);

  return (
    <div style={styles.panel}>
      <div style={styles.headerRow}>
        <button style={styles.dismissAll} onClick={onDismiss}>
          Dismiss all
        </button>
        <div style={styles.headerRight}>
          <span style={styles.count}>{logs.length}</span>
          <button style={styles.chevron} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.body}>
          {logs.map((line, i) => (
            <div key={i} style={styles.row}>
              <span style={{ ...styles.tag, background: "rgba(255,78,0,0.16)", color: "#ffb677" }}>
                System
              </span>
              <span style={{ ...styles.tag, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                Log
              </span>
              <span style={styles.line}>{line}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {isDone && (
        <div style={styles.doneRow}>
          <span>Build finished — opening workspace…</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: "min(720px, 90vw)",
    maxHeight: "60vh",
    background: "#0d0d0f",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  dismissAll: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.75)",
    fontSize: "12.5px",
    fontWeight: 600,
    cursor: "pointer",
  },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  count: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.6)",
    fontSize: "11px",
    fontWeight: 700,
    borderRadius: "999px",
    padding: "1px 8px",
  },
  chevron: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.5)",
    cursor: "pointer",
    fontSize: "12px",
  },
  body: {
    overflowY: "auto",
    padding: "8px 4px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "6px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
  },
  tag: {
    flexShrink: 0,
    borderRadius: "5px",
    padding: "1px 6px",
    fontSize: "10px",
    fontWeight: 700,
  },
  line: {
    color: "rgba(255,255,255,0.75)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  doneRow: {
    padding: "10px 14px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    color: "#22c55e",
    fontSize: "12px",
    fontWeight: 600,
    flexShrink: 0,
  },
};
