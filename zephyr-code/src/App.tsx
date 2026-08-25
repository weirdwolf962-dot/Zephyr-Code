import { useState } from "react";
import { bootHelloWorld, getContainer, type BootStage } from "./webcontainerBoot";
import { readAllFiles, downloadAsZip, type FlatFile } from "./fileTree";
import { loadProjects, saveProject, deleteProject, type Project } from "./utils/projects";
import LandingScreen from "./screens/LandingScreen";
import Workspace, { type ChatMessage } from "./screens/Workspace";
import LogConsole from "./components/LogConsole";

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

type Screen = "landing" | "building" | "workspace";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [stage, setStage] = useState<BootStage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [isZipping, setIsZipping] = useState(false);

  const ready = stage === "ready";
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";

  async function runBoot(prompt: string) {
    setMessages([
      { role: "user", text: prompt },
      {
        role: "assistant",
        text: "Real AI code generation isn't wired up yet — for now I'm booting the test environment so you can see the pipeline work end to end.",
      },
    ]);
    setLogs([]);
    setScreen("building");

    await bootHelloWorld({
      onLog: (line) => setLogs((prev) => [...prev, line]),
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
        }
        setTimeout(() => setScreen("workspace"), 900);
      },
    });
  }

  function handleLandingSubmit(prompt: string) {
    if (screen === "building") return; // already mid-boot — ignore a stray second submit
    const project = saveProject(prompt);
    setProjects((prev) => [project, ...prev]);
    runBoot(prompt);
  }

  function handleDeleteProject(id: string) {
    deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  function handleChatSend(text: string) {
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
    setLogs([]);
    setScreen("building");
    bootHelloWorld({
      onLog: (line) => setLogs((prev) => [...prev, line]),
      onStageChange: setStage,
      onPreviewReady: async (url) => {
        setPreviewUrl(url);
        const container = getContainer();
        if (container) {
          const flat = await readAllFiles(container);
          setFiles(flat);
        }
        setTimeout(() => setScreen("workspace"), 900);
      },
    });
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

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <button style={styles.brand} onClick={() => setScreen("landing")} title="Back to start">
          <span style={styles.brandMark}>⟨/⟩</span>
          <span style={styles.brandName}>Zephyr Code</span>
        </button>
        <div style={styles.headerRight}>
          {screen !== "landing" && (
            <>
              <button
                style={{ ...styles.iconButton, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}
                onClick={handleDownload}
                disabled={!ready || isZipping}
                title={ready ? "Download project as .zip" : "Available once a preview is ready"}
              >
                {isZipping ? "…" : "⬇"}
              </button>
              <button style={styles.exitButton} onClick={exitToZephyr}>
                ← Exit to Zephyr
              </button>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <main style={styles.main}>
        {screen === "landing" && (
          <LandingScreen projects={projects} onSubmit={handleLandingSubmit} onDeleteProject={handleDeleteProject} />
        )}

        {screen === "building" && (
          <div style={styles.buildingScreen}>
            <LogConsole
              logs={logs}
              isDone={stage === "ready"}
              onDismiss={() => setScreen(stage === "ready" ? "workspace" : "landing")}
            />
          </div>
        )}

        {screen === "workspace" && (
          <Workspace
            messages={messages}
            onSend={handleChatSend}
            busy={busy}
            previewUrl={previewUrl}
            files={files}
          />
        )}
      </main>
    </div>
  );
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
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  brandMark: { color: "#ff4e00", fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600 },
  brandName: { fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "17px", color: "rgba(255,255,255,0.85)" },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  iconButton: {
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,78,0,0.1)",
    color: "#ffb677",
    border: "1px solid rgba(255,78,0,0.3)",
    borderRadius: "10px",
    fontSize: "14px",
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
  buildingScreen: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
