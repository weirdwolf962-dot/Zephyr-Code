import { useEffect, useRef, useState } from "react";
import { bootHelloWorld, type BootStage } from "./webcontainerBoot";

/**
 * Zephyr Code — standalone shell.
 *
 * This file (plus main.tsx) is the ONLY place that knows Zephyr main
 * exists. No other file in this project should import from, or reference,
 * Zephyr's codebase. The only link between the two apps is the postMessage
 * exit handshake below, and the origin query param as a fallback.
 */

function getReturnUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("origin");
}

function exitToZephyr() {
  // Primary path: embedded inline in Zephyr main via an iframe.
  if (window.self !== window.top) {
    window.parent.postMessage({ type: "zephyr-code:exit" }, "*");
    return;
  }
  // Fallback: opened standalone (e.g. testing this URL directly).
  const returnUrl = getReturnUrl();
  if (window.opener) {
    window.close();
    return;
  }
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  alert("Can't find Zephyr main. Open Zephyr Code from inside Zephyr instead.");
}

const stageLabels: Record<BootStage, string> = {
  idle: "Idle",
  booting: "Booting runtime",
  mounting: "Mounting files",
  installing: "Installing packages",
  starting: "Starting dev server",
  ready: "Preview ready",
  error: "Error",
};

export default function App() {
  const [stage, setStage] = useState<BootStage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleBoot = () => {
    setLogs([]);
    setPreviewUrl(null);
    bootHelloWorld({
      onLog: (line) => setLogs((prev) => [...prev, line]),
      onStageChange: setStage,
      onPreviewReady: setPreviewUrl,
    });
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>⟨/⟩</span>
          <span style={styles.brandName}>Zephyr Code</span>
        </div>
        <button style={styles.exitButton} onClick={exitToZephyr}>
          ← Exit to Zephyr
        </button>
      </header>

      {/* Body */}
      <main style={styles.main}>
        {/* Left: control + logs */}
        <section style={styles.leftPane}>
          <div style={styles.statusRow}>
            <span style={{ ...styles.statusDot, background: stageColor(stage) }} />
            <span style={styles.statusLabel}>{stageLabels[stage]}</span>
          </div>

          <button
            style={{
              ...styles.bootButton,
              opacity: stage !== "idle" && stage !== "ready" && stage !== "error" ? 0.6 : 1,
            }}
            onClick={handleBoot}
            disabled={stage !== "idle" && stage !== "ready" && stage !== "error"}
          >
            {stage === "idle" ? "Boot WebContainer Test" : "Reboot Test"}
          </button>

          <div style={styles.logPanel}>
            {logs.length === 0 ? (
              <p style={styles.logPlaceholder}>Logs will appear here once you boot.</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} style={styles.logLine}>
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </section>

        {/* Right: live preview */}
        <section style={styles.rightPane}>
          {previewUrl ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title="WebContainer Preview"
              style={styles.iframe}
            />
          ) : (
            <div style={styles.previewPlaceholder}>
              <p style={styles.previewPlaceholderText}>
                {stage === "error"
                  ? "Boot failed — check the log on the left."
                  : "Live preview will render here once the dev server is ready."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function stageColor(stage: BootStage): string {
  switch (stage) {
    case "ready":
      return "#22c55e";
    case "error":
      return "#ef4444";
    case "idle":
      return "rgba(255,255,255,0.25)";
    default:
      return "#ff4e00";
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    width: "100vw",
    background: "#0a0502",
    color: "#fff",
    fontFamily: "var(--font-sans)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 22px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(10,5,2,0.85)",
    backdropFilter: "blur(20px)",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  brandMark: {
    color: "#ff4e00",
    fontFamily: "var(--font-mono)",
    fontSize: "16px",
    fontWeight: 600,
  },
  brandName: {
    fontFamily: "var(--font-serif)",
    fontStyle: "italic",
    fontSize: "17px",
    color: "rgba(255,255,255,0.85)",
  },
  exitButton: {
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    padding: "7px 14px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  main: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  leftPane: {
    width: "38%",
    minWidth: "320px",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    padding: "18px",
    gap: "14px",
    minHeight: 0,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.5)",
  },
  bootButton: {
    background: "rgba(255,78,0,0.15)",
    border: "1px solid rgba(255,78,0,0.35)",
    color: "#ffb677",
    borderRadius: "12px",
    padding: "11px 16px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    cursor: "pointer",
  },
  logPanel: {
    flex: 1,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "12px 14px",
    overflowY: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: "11.5px",
    lineHeight: 1.6,
    minHeight: 0,
  },
  logPlaceholder: {
    color: "rgba(255,255,255,0.25)",
  },
  logLine: {
    color: "rgba(255,182,119,0.85)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  rightPane: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  iframe: {
    flex: 1,
    border: "none",
    width: "100%",
    height: "100%",
  },
  previewPlaceholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
  },
  previewPlaceholderText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: "13px",
    textAlign: "center",
    maxWidth: "280px",
  },
};
