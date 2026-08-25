import { useEffect, useRef, useState } from "react";
import { bootHelloWorld, getContainer, type BootStage } from "./webcontainerBoot";
import { readAllFiles, downloadAsZip, type FlatFile } from "./fileTree";

/**
 * Zephyr Code — standalone shell.
 *
 * This file (plus main.tsx, webcontainerBoot.ts, fileTree.ts) is the ONLY
 * place that knows Zephyr main exists — via the postMessage exit handshake
 * below. No other file in this project references Zephyr's codebase.
 */

function getReturnUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("origin");
}

function exitToZephyr() {
  if (window.self !== window.top) {
    window.parent.postMessage({ type: "zephyr-code:exit" }, "*");
    return;
  }
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

type ChatRole = "user" | "assistant" | "log";
interface ChatMessage {
  role: ChatRole;
  text: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Tell me what to build, and I'll get the environment running. (Real AI code generation isn't wired up yet — right now any message just boots the test environment so you can see the pipeline work end to end.)",
    },
  ]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<BootStage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ready = stage === "ready";
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";

  async function runBoot() {
    await bootHelloWorld({
      onLog: (line) => setMessages((prev) => [...prev, { role: "log", text: line }]),
      onStageChange: setStage,
      onPreviewReady: async (url) => {
        setPreviewUrl(url);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Environment's up — preview is live on the right." },
        ]);
        const container = getContainer();
        if (container) {
          const flat = await readAllFiles(container);
          setFiles(flat);
          setActiveFilePath(flat[0]?.path ?? null);
        }
      },
    });
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    if (busy) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Still working on the current build — one sec." },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "Spinning up the environment for that…" },
    ]);
    runBoot();
  }

  async function handleDownload() {
    const container = getContainer();
    if (!container) return;
    setIsZipping(true);
    try {
      const flat = await readAllFiles(container);
      await downloadAsZip(flat, "zephyr-code-project.zip");
    } finally {
      setIsZipping(false);
    }
  }

  const activeFile = files.find((f) => f.path === activeFilePath) ?? null;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>⟨/⟩</span>
          <span style={styles.brandName}>Zephyr Code</span>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{ ...styles.downloadButton, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}
            onClick={handleDownload}
            disabled={!ready || isZipping}
            title={ready ? "Download project as .zip" : "Available once a preview is ready"}
          >
            {isZipping ? "Zipping…" : "⬇ Download .zip"}
          </button>
          <button style={styles.exitButton} onClick={exitToZephyr}>
            ← Exit to Zephyr
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={styles.main}>
        {/* Left: chat with Zephyr */}
        <section style={styles.leftPane}>
          <div style={styles.chatScroll}>
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            <div ref={chatEndRef} />
          </div>

          <div style={styles.inputRow}>
            <input
              style={styles.chatInput}
              placeholder="Tell Zephyr what to build, fix, or change…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button style={styles.sendButton} onClick={handleSend} disabled={busy}>
              Send
            </button>
          </div>
        </section>

        {/* Right: preview / code */}
        <section style={styles.rightPane}>
          <div style={styles.previewArea}>
            {viewMode === "preview" ? (
              previewUrl ? (
                <iframe key={previewUrl} src={previewUrl} title="Preview" style={styles.iframe} />
              ) : (
                <div style={styles.previewPlaceholder}>
                  <span style={{ ...styles.statusDot, background: stageColor(stage) }} />
                  <p style={styles.previewPlaceholderText}>{stageLabels[stage]}</p>
                </div>
              )
            ) : (
              <div style={styles.codeView}>
                <div style={styles.fileList}>
                  {files.length === 0 ? (
                    <p style={styles.fileListEmpty}>No files yet.</p>
                  ) : (
                    files.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => setActiveFilePath(f.path)}
                        style={{
                          ...styles.fileListItem,
                          background: f.path === activeFilePath ? "rgba(255,78,0,0.12)" : "transparent",
                          color: f.path === activeFilePath ? "#ffb677" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        {f.path}
                      </button>
                    ))
                  )}
                </div>
                <pre style={styles.codeContent}>
                  {activeFile ? activeFile.contents : "Select a file to view its contents."}
                </pre>
              </div>
            )}
          </div>

          {/* Toolbar below preview */}
          <div style={styles.toolbar}>
            <button
              style={{ ...styles.toggleButton, ...(viewMode === "preview" ? styles.toggleButtonActive : {}) }}
              onClick={() => setViewMode("preview")}
            >
              Preview
            </button>
            <button
              style={{ ...styles.toggleButton, ...(viewMode === "code" ? styles.toggleButtonActive : {}) }}
              onClick={() => setViewMode("code")}
              disabled={files.length === 0}
            >
              Code {files.length > 0 ? `(${files.length})` : ""}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ChatBubble({ role, text }: ChatMessage) {
  if (role === "log") {
    return <div style={styles.logLine}>{text}</div>;
  }
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? styles.userBubble : styles.assistantBubble}>{text}</div>
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
  brand: { display: "flex", alignItems: "center", gap: "10px" },
  brandMark: { color: "#ff4e00", fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600 },
  brandName: { fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "17px", color: "rgba(255,255,255,0.85)" },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  downloadButton: {
    background: "rgba(255,78,0,0.1)",
    color: "#ffb677",
    border: "1px solid rgba(255,78,0,0.3)",
    borderRadius: "10px",
    padding: "7px 14px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
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
  main: { flex: 1, display: "flex", minHeight: 0 },
  leftPane: {
    width: "36%",
    minWidth: "300px",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
  },
  userBubble: {
    background: "rgba(255,78,0,0.15)",
    border: "1px solid rgba(255,78,0,0.3)",
    color: "#fff",
    borderRadius: "14px 14px 2px 14px",
    padding: "9px 13px",
    fontSize: "13px",
    maxWidth: "85%",
  },
  assistantBubble: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    borderRadius: "14px 14px 14px 2px",
    padding: "9px 13px",
    fontSize: "13px",
    maxWidth: "85%",
  },
  logLine: {
    fontFamily: "var(--font-mono)",
    fontSize: "10.5px",
    color: "rgba(255,182,119,0.55)",
    paddingLeft: "4px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    padding: "14px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  chatInput: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "10px 12px",
    color: "#fff",
    fontSize: "13px",
    outline: "none",
  },
  sendButton: {
    background: "#ff4e00",
    color: "#0a0502",
    border: "none",
    borderRadius: "10px",
    padding: "10px 16px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  rightPane: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  previewArea: { flex: 1, display: "flex", minHeight: 0 },
  iframe: { flex: 1, border: "none", width: "100%", height: "100%" },
  previewPlaceholder: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  statusDot: { width: "8px", height: "8px", borderRadius: "50%" },
  previewPlaceholderText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  codeView: { flex: 1, display: "flex", minHeight: 0 },
  fileList: {
    width: "220px",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    overflowY: "auto",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  fileListEmpty: { color: "rgba(255,255,255,0.3)", fontSize: "12px", padding: "8px" },
  fileListItem: {
    textAlign: "left",
    border: "none",
    borderRadius: "8px",
    padding: "7px 9px",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
  },
  codeContent: {
    flex: 1,
    margin: 0,
    padding: "16px",
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.85)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  toolbar: {
    display: "flex",
    gap: "6px",
    padding: "10px 14px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  toggleButton: {
    background: "transparent",
    color: "rgba(255,255,255,0.5)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "7px 14px",
    fontSize: "11.5px",
    fontWeight: 600,
    cursor: "pointer",
  },
  toggleButtonActive: {
    background: "rgba(255,78,0,0.15)",
    borderColor: "rgba(255,78,0,0.35)",
    color: "#ffb677",
  },
};
