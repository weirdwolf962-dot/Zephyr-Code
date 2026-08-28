import React, { useEffect, useRef, useState } from "react";
import {
  TerminalIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from "./icons";

interface BuildConsoleProps {
  logs: string[];
  onClear: () => void;
}

type LogFilter = "all" | "system" | "log" | "error";

export default function BuildConsole({ logs, onClear }: BuildConsoleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, collapsed]);

  const filteredLogs = logs.filter((line) => {
    const isErr = isErrorLine(line);
    const isSys = isSystemLine(line);

    if (filter === "error" && !isErr) return false;
    if (filter === "system" && !isSys) return false;
    if (filter === "log" && (isErr || isSys)) return false;

    if (search.trim()) {
      return line.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const errorCount = logs.filter(isErrorLine).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        ...styles.panel,
        height: collapsed ? "32px" : "210px",
        minHeight: collapsed ? "32px" : "210px",
        maxHeight: collapsed ? "32px" : "40vh",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          ...styles.headerRow,
          height: "32px",
          borderBottom: collapsed ? "none" : "1px solid rgba(255, 255, 255, 0.06)",
          cursor: "pointer",
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "INPUT") {
            setCollapsed((c) => !c);
          }
        }}
      >
        <div style={styles.headerLeft}>
          <div
            style={styles.terminalBadge}
            title={collapsed ? "Click to expand console" : "Click to collapse console"}
          >
            <TerminalIcon size={13} style={{ color: "#ff8438" }} />
            <span style={styles.title}>Console</span>
            {collapsed && logs.length > 0 && (
              <span style={styles.collapsedBadge}>
                {logs.length} line{logs.length > 1 ? "s" : ""}
                {errorCount > 0 && ` • ${errorCount} err`}
              </span>
            )}
          </div>

          {!collapsed && (
            <div style={styles.filterGroup}>
              <button
                style={{
                  ...styles.filterBtn,
                  ...(filter === "all" ? styles.filterBtnActive : {}),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter("all");
                }}
              >
                All ({logs.length})
              </button>
              <button
                style={{
                  ...styles.filterBtn,
                  ...(filter === "system" ? styles.filterBtnActive : {}),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter("system");
                }}
              >
                System
              </button>
              <button
                style={{
                  ...styles.filterBtn,
                  ...(filter === "log" ? styles.filterBtnActive : {}),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter("log");
                }}
              >
                Logs
              </button>
              {errorCount > 0 && (
                <button
                  style={{
                    ...styles.filterBtn,
                    ...(filter === "error" ? styles.filterBtnActive : {}),
                    color: "#f87171",
                    borderColor: filter === "error" ? "#ef4444" : "rgba(239, 68, 68, 0.2)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter("error");
                  }}
                >
                  Errors ({errorCount})
                </button>
              )}
            </div>
          )}
        </div>

        <div style={styles.headerRight}>
          {!collapsed && (
            <div style={styles.searchWrapper} onClick={(e) => e.stopPropagation()}>
              <SearchIcon size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
              <input
                type="text"
                placeholder="Filter logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
            </div>
          )}

          {!collapsed && (
            <>
              <button
                style={styles.iconActionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                title={copied ? "Copied to clipboard" : "Copy full logs"}
              >
                {copied ? <CheckIcon size={13} style={{ color: "#4ade80" }} /> : <CopyIcon size={13} />}
              </button>

              <button
                style={styles.iconActionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                title="Clear console output"
              >
                <TrashIcon size={13} />
              </button>
            </>
          )}

          <button
            style={{
              ...styles.iconActionBtn,
              background: "rgba(255, 78, 0, 0.12)",
              color: "#ffb677",
              border: "1px solid rgba(255, 120, 50, 0.2)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            title={collapsed ? "Expand console (pull up)" : "Hide console (pull down)"}
          >
            {collapsed ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      {!collapsed && (
        <div style={styles.body}>
          {filteredLogs.length === 0 ? (
            <div style={styles.emptyContainer}>
              <span style={styles.emptyDot}></span>
              <p style={styles.emptyText}>
                {logs.length === 0
                  ? "Console idle — output from compiler and web server will stream here."
                  : "No logs match the selected filter."}
              </p>
            </div>
          ) : (
            filteredLogs.map((line, i) => {
              const isErr = isErrorLine(line);
              const isSys = isSystemLine(line);
              return (
                <div
                  key={i}
                  style={{
                    ...styles.row,
                    background: isErr
                      ? "rgba(239, 68, 68, 0.08)"
                      : i % 2 === 0
                      ? "rgba(255, 255, 255, 0.01)"
                      : "transparent",
                  }}
                >
                  <span style={styles.lineNum}>{i + 1}</span>

                  <span
                    style={{
                      ...styles.tag,
                      background: isErr
                        ? "rgba(239,68,68,0.18)"
                        : isSys
                        ? "rgba(255,78,0,0.18)"
                        : "rgba(255,255,255,0.08)",
                      color: isErr ? "#fca5a5" : isSys ? "#ffb677" : "rgba(255,255,255,0.6)",
                      borderColor: isErr ? "rgba(239,68,68,0.3)" : isSys ? "rgba(255,78,0,0.3)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {isErr ? "ERR" : isSys ? "SYS" : "LOG"}
                  </span>

                  <span
                    style={{
                      ...styles.lineText,
                      color: isErr ? "#fca5a5" : isSys ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 182, 119, 0.85)",
                    }}
                  >
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
    line.startsWith("ERR") ||
    /\berror\b/i.test(line) ||
    /SyntaxError/i.test(line) ||
    /Cannot find/i.test(line) ||
    /Unexpected token/i.test(line)
  );
}

function isSystemLine(line: string): boolean {
  return (
    line.startsWith("[WebContainer]") ||
    line.startsWith("[Virtual") ||
    line.startsWith("[Runtime]") ||
    line.startsWith("✅") ||
    line.startsWith("[Zephyr]") ||
    line.startsWith("Booting") ||
    line.startsWith("Mounting")
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flexShrink: 0,
    background: "#0a0604",
    borderTop: "1px solid rgba(255, 120, 50, 0.15)",
    display: "flex",
    flexDirection: "column",
    zIndex: 10,
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 14px",
    background: "#0e0805",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    flexShrink: 0,
    gap: "10px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    overflow: "hidden",
  },
  terminalBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  collapsedBadge: {
    fontSize: "9.5px",
    background: "rgba(255, 78, 0, 0.15)",
    color: "#ffb677",
    padding: "1px 5px",
    borderRadius: "4px",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
  },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#fff",
    fontFamily: "var(--font-sans)",
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  filterBtn: {
    background: "transparent",
    border: "1px solid transparent",
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: "11px",
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  filterBtnActive: {
    background: "rgba(255, 78, 0, 0.12)",
    borderColor: "rgba(255, 78, 0, 0.3)",
    color: "#ffb677",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  searchWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "6px",
    padding: "3px 8px",
  },
  searchInput: {
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: "11px",
    outline: "none",
    width: "100px",
  },
  iconActionBtn: {
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "rgba(255, 255, 255, 0.6)",
    borderRadius: "6px",
    width: "26px",
    height: "26px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 0",
    fontFamily: "var(--font-mono)",
    background: "#080402",
  },
  emptyContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "16px 20px",
  },
  emptyDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "rgba(255, 120, 50, 0.4)",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: "12px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "3px 14px",
    fontSize: "11.5px",
    lineHeight: 1.5,
  },
  lineNum: {
    width: "28px",
    textAlign: "right",
    flexShrink: 0,
    color: "rgba(255, 255, 255, 0.18)",
    fontSize: "10px",
    userSelect: "none",
  },
  tag: {
    flexShrink: 0,
    border: "1px solid",
    borderRadius: "4px",
    padding: "0px 5px",
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
