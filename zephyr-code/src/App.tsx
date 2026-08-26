import { useState } from "react";
import { bootHelloWorld, getContainer, writeFile, type BootStage } from "./webcontainerBoot";
import { readAllFiles, downloadAsZip, type FlatFile } from "./fileTree";
import { loadProjects, saveProject, deleteProject, type Project } from "./utils/projects";
import LandingScreen from "./screens/LandingScreen";
import Workspace, { type ChatMessage } from "./screens/Workspace";
import LogConsole from "./components/LogConsole";
import { DownloadIcon, HomeIcon } from "./components/icons";

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
  // Bumped every time "server-ready" fires — including restarts triggered by
  // a save. previewUrl often stays the same string across a restart, so the
  // iframe needs something that always changes to force a real remount/reload.
  const [previewNonce, setPreviewNonce] = useState(0);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [isZipping, setIsZipping] = useState(false);

  const ready = stage === "ready";
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";

  // Shared by "submit from landing", "reopen an old project", and "send a
  // chat message" — all three just (re)boot the same test environment for
  // now, since real per-project AI generation isn't wired up yet.
  async function startBuild(prompt: string) {
    let isFirstReady = true;

    setMessages((prev) => [
      ...prev,
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
        setPreviewNonce((n) => n + 1);

        const container = getContainer();
        if (container) {
          const flat = await readAllFiles(container);
          setFiles(flat);
        }

        if (isFirstReady) {
          isFirstReady = false;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: "Environment's up — preview is live on the right." },
          ]);
          setTimeout(() => setScreen("workspace"), 900);
        } else {
          // A save triggered node --watch to restart the server, which
          // re-fired server-ready — this is the hot-reload loop working.
          setMessages((prev) => [...prev, { role: "log", text: "Preview reloaded after save." }]);
        }
      },
    });
  }

  function handleLandingSubmit(prompt: string) {
    if (screen === "building") return; // already mid-boot — ignore a stray second submit
    const project = saveProject(prompt);
    setProjects((prev) => [project, ...prev]);
    startBuild(prompt);
  }

  function handleOpenProject(project: Project) {
    if (screen === "building") return;
    startBuild(project.name);
  }

  function handleDeleteProject(id: string) {
    deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  function handleChatSend(text: string) {
    if (busy) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "Still working on the current build — one sec." },
      ]);
      return;
    }
    startBuild(text);
  }

  async function handleSaveFile(path: string, contents: string) {
    await writeFile(path, contents);
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, contents } : f)));
  }

  function handleClearLogs() {
    setLogs([]);
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
        <button style={styles.brand} onClick={() => setScreen("landing")} title="Home — Zephyr Code's start screen">
          <span style={styles.brandMark}>⟨/⟩</span>
          <span style={styles.brandName}>Zephyr Code</span>
        </button>
        <div style={styles.headerRight}>
          {screen !== "landing" && (
            <>
              <button
                style={styles.iconButton}
                onClick={() => setScreen("landing")}
                title="Home — go to Zephyr Code's start screen (stays inside Zephyr Code)"
              >
                <HomeIcon size={15} />
              </button>
              <button
                style={{ ...styles.iconButton, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}
                onClick={handleDownload}
                disabled={!ready || isZipping}
                title={ready ? "Download project as .zip" : "Available once a preview is ready"}
              >
                <DownloadIcon size={15} />
              </button>
              <button
                style={styles.exitButton}
                onClick={exitToZephyr}
                title="Exit — leave Zephyr Code entirely and return to Zephyr"
              >
                ← Exit to Zephyr
              </button>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <main style={styles.main}>
        {screen === "landing" && (
          <LandingScreen
            projects={projects}
            onSubmit={handleLandingSubmit}
            onOpenProject={handleOpenProject}
            onDeleteProject={handleDeleteProject}
          />
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
            previewNonce={previewNonce}
            files={files}
            onSaveFile={handleSaveFile}
            logs={logs}
            onClearLogs={handleClearLogs}
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
    cursor: "pointer",
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
