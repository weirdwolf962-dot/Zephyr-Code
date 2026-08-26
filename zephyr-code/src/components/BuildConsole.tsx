import { useEffect, useRef, useState } from "react";

interface BuildConsoleProps {
  logs: string[];
  onClear: () => void;
}

// Docked panel below the code view — captures every line piped from the
// WebContainer's process output (npm install, npm run dev, and every
// restart triggered by a save afterward). Error lines are colored
// distinctly so a broken save is obvious the moment it happens.
export default function BuildConsole({ logs, onClear }: BuildConsoleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, collapsed]);

  return (
    <div style={styles.panel}>
      <div style={styles.headerRow}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Build output</span>
          <span style={styles.count}>{logs.length}</span>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.clearButton} onClick={onClear}>
            Clear
          </button>
          <button style={styles.chevron} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.body}>
          {logs.length === 0 ? (
            <p style={styles.empty}>No output yet.</p>
          ) : (
            logs.map((line, i) => {
              const isError = isErrorLine(line);
              return (
                <div key={i} style={styles.row}>
                  <span
                    style={{
                      ...styles.tag,
                      background: isError ? "rgba(239,68,68,0.16)" : "rgba(255,78,0,0.16)",
                      color: isError ? "#fca5a5" : "#ffb677",
                    }}
                  >
                    {isError ? "Error" : "System"}
                  </span>
                  <span style={styles.tag2}>Log</span>
                  <span style={{ ...styles.line, color: isError ? "#fca5a5" : "rgba(255,255,255,0.75)" }}>
                    {line}
                  </span>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function isErrorLine(line: string): boolean {
  return (
    line.startsWith("❌") ||
    /\berror\b/i.test(line) ||
    /SyntaxError/i.test(line) ||
    /Cannot find/i.test(line) ||
    /Unexpected token/i.test(line)
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    height: "200px",
    flexShrink: 0,
    background: "#0d0d0f",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "8px" },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
  },
  count: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.5)",
    fontSize: "10.5px",
    fontWeight: 700,
    borderRadius: "999px",
    padding: "1px 7px",
  },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  clearButton: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  chevron: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
    fontSize: "11px",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "6px 4px",
  },
  empty: {
    color: "rgba(255,255,255,0.25)",
    fontSize: "12px",
    padding: "8px 14px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "4px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: "11.5px",
  },
  tag: {
    flexShrink: 0,
    borderRadius: "5px",
    padding: "1px 6px",
    fontSize: "9.5px",
    fontWeight: 700,
  },
  tag2: {
    flexShrink: 0,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.5)",
    borderRadius: "5px",
    padding: "1px 6px",
    fontSize: "9.5px",
    fontWeight: 700,
  },
  line: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
