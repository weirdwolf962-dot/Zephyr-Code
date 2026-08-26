import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { FlatFile } from "../fileTree";
import { languageFromPath } from "../utils/language";
import { SaveIcon } from "../components/icons";
import BuildConsole from "../components/BuildConsole";

export type ChatRole = "user" | "assistant" | "log";
export interface ChatMessage {
  role: ChatRole;
  text: string;
}

interface WorkspaceProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  busy: boolean;
  previewUrl: string | null;
  previewNonce: number;
  files: FlatFile[];
  onSaveFile: (path: string, contents: string) => Promise<void>;
  logs: string[];
  onClearLogs: () => void;
}

type SaveState = "idle" | "dirty" | "saving" | "saved";

export default function Workspace({
  messages,
  onSend,
  busy,
  previewUrl,
  previewNonce,
  files,
  onSaveFile,
  logs,
  onClearLogs,
}: WorkspaceProps) {
  const [input, setInput] = useState("");
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  // Local edit buffer, keyed by path — separate from `files` (the
  // last-saved/last-read-from-container state) so we know what's dirty.
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Monaco's Ctrl+S command is bound once on mount, so it needs a ref to
  // always see the CURRENT active file/buffer, not whatever they were
  // when the editor first mounted.
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeFilePath && files.length > 0) setActiveFilePath(files[0].path);
  }, [files, activeFilePath]);

  // When the container's file list updates (e.g. a fresh boot), drop any
  // stale local buffer for paths that no longer exist, and seed buffers
  // for files we haven't opened yet lazily (handled in getBufferFor).
  const activeFile = files.find((f) => f.path === activeFilePath) ?? null;
  const bufferValue = activeFilePath ? buffers[activeFilePath] ?? activeFile?.contents ?? "" : "";
  const isDirty = activeFile ? bufferValue !== activeFile.contents : false;

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    onSend(text);
  }

  function handleEditorChange(value: string | undefined) {
    if (!activeFilePath) return;
    setBuffers((prev) => ({ ...prev, [activeFilePath]: value ?? "" }));
    setSaveState("dirty");
  }

  async function handleSaveActive() {
    if (!activeFilePath) return;
    const content = buffers[activeFilePath];
    if (content === undefined) return; // nothing edited
    setSaveState("saving");
    try {
      await onSaveFile(activeFilePath, content);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveState("dirty");
    }
  }

  saveRef.current = handleSaveActive;

  const handleEditorMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });
  };

  return (
    <div style={styles.workspace}>
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

      {/* Right: Preview / Code */}
      <section style={styles.rightPane}>
        <div style={styles.tabBar}>
          <button
            style={{ ...styles.tab, ...(viewMode === "preview" ? styles.tabActive : {}) }}
            onClick={() => setViewMode("preview")}
          >
            ● Preview
          </button>
          <button
            style={{ ...styles.tab, ...(viewMode === "code" ? styles.tabActive : {}) }}
            onClick={() => setViewMode("code")}
            disabled={files.length === 0}
          >
            Code
          </button>
        </div>

        <div style={styles.contentArea}>
          {viewMode === "preview" ? (
            previewUrl ? (
              <iframe key={`${previewUrl}-${previewNonce}`} src={previewUrl} title="Preview" style={styles.iframe} />
            ) : (
              <div style={styles.previewPlaceholder}>
                <p style={styles.placeholderText}>Waiting for a build…</p>
              </div>
            )
          ) : (
            <div style={styles.codeTab}>
              <div style={styles.codeView}>
                <div style={styles.fileExplorer}>
                  <p style={styles.fileExplorerLabel}>File explorer</p>
                  {files.map((f) => {
                    const dirty = buffers[f.path] !== undefined && buffers[f.path] !== f.contents;
                    return (
                      <button
                        key={f.path}
                        onClick={() => setActiveFilePath(f.path)}
                        style={{
                          ...styles.fileItem,
                          background: f.path === activeFilePath ? "rgba(255,78,0,0.14)" : "transparent",
                          color: f.path === activeFilePath ? "#ffb677" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        {f.path}
                        {dirty && <span style={styles.dirtyDot}>●</span>}
                      </button>
                    );
                  })}
                </div>

                <div style={styles.editorArea}>
                  {activeFile && (
                    <div style={styles.editorTab}>
                      <span>{activeFile.path}</span>
                      <button
                        style={{
                          ...styles.saveButton,
                          opacity: isDirty || saveState === "saving" ? 1 : 0.35,
                          cursor: isDirty && saveState !== "saving" ? "pointer" : "default",
                        }}
                        onClick={handleSaveActive}
                        disabled={!isDirty || saveState === "saving"}
                        title="Save (Ctrl/Cmd+S) — writes to the WebContainer and reloads the preview"
                      >
                        <SaveIcon size={12} />
                        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {activeFile ? (
                      <Editor
                        key={activeFile.path}
                        language={languageFromPath(activeFile.path)}
                        value={bufferValue}
                        theme="vs-dark"
                        onChange={handleEditorChange}
                        onMount={handleEditorMount}
                        options={{
                          fontSize: 12.5,
                          fontFamily: "JetBrains Mono, monospace",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    ) : (
                      <div style={styles.previewPlaceholder}>
                        <p style={styles.placeholderText}>Select a file to view it.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrolling build-output panel, below the code view */}
              <BuildConsole logs={logs} onClear={onClearLogs} />
            </div>
          )}
        </div>
      </section>
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

const styles: Record<string, React.CSSProperties> = {
  workspace: { flex: 1, display: "flex", minHeight: 0 },
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
  tabBar: {
    display: "flex",
    gap: "4px",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  tab: {
    background: "transparent",
    color: "rgba(255,255,255,0.45)",
    border: "1px solid transparent",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "12.5px",
    fontWeight: 600,
    cursor: "pointer",
  },
  tabActive: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
  },
  contentArea: { flex: 1, display: "flex", minHeight: 0 },
  iframe: { flex: 1, border: "none", width: "100%", height: "100%" },
  previewPlaceholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "rgba(255,255,255,0.3)", fontSize: "13px" },
  codeTab: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  codeView: { flex: 1, display: "flex", minHeight: 0 },
  fileExplorer: {
    width: "220px",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    overflowY: "auto",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  fileExplorerLabel: {
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.3)",
    padding: "4px 8px 8px",
  },
  fileItem: {
    textAlign: "left",
    border: "none",
    borderRadius: "8px",
    padding: "7px 9px",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
  },
  dirtyDot: { color: "#ff4e00", fontSize: "8px" },
  editorArea: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  editorTab: {
    padding: "8px 14px",
    fontSize: "11.5px",
    fontFamily: "var(--font-mono)",
    color: "rgba(255,255,255,0.5)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255,78,0,0.12)",
    color: "#ffb677",
    border: "1px solid rgba(255,78,0,0.3)",
    borderRadius: "7px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 600,
  },
};
