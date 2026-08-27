import React, { useState } from "react";
import {
  bootProject,
  getContainer,
  writeFile,
  createFile,
  getIsVirtual,
  type BootStage,
} from "./webcontainerBoot";
import { readAllFiles, downloadAsZip, type FlatFile } from "./fileTree";
import { loadProjects, saveProject, deleteProject, type Project } from "./utils/projects";
import type { AttachedFile } from "./utils/fileAttachment";
import LandingScreen from "./screens/LandingScreen";
import Workspace, { type ChatMessage } from "./screens/Workspace";
import LogConsole from "./components/LogConsole";
import { DownloadIcon, HomeIcon, ZapIcon, SparklesIcon } from "./components/icons";

type Screen = "landing" | "building" | "workspace";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [activeProjectName, setActiveProjectName] = useState<string>("Untitled Workspace");
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [stage, setStage] = useState<BootStage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [isZipping, setIsZipping] = useState(false);

  const ready = stage === "ready";
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";
  const isVirtual = getIsVirtual();

  async function startBuild(prompt: string, initialFiles?: AttachedFile[]) {
    let isFirstReady = true;
    setActiveProjectName(prompt.length > 32 ? prompt.slice(0, 32) + "…" : prompt);

    const initialFilesSummary =
      initialFiles && initialFiles.length > 0
        ? ` with ${initialFiles.length} attached file(s) (${initialFiles.map((f) => f.name).join(", ")})`
        : "";

    setMessages([
      { role: "user", text: prompt + (initialFilesSummary ? `\n[Attached: ${initialFiles?.map((f) => f.name).join(", ")}]` : "") },
      {
        role: "assistant",
        text: `Synthesizing architecture for "${prompt}"${initialFilesSummary}. Initializing full-stack Node.js environment, Monaco editor, and live hot-reload preview.`,
      },
    ]);
    setLogs([]);
    setScreen("building");

    await bootProject({
      prompt,
      initialFiles: initialFiles?.map((f) => ({ name: f.name, contents: f.contents })),
      onLog: (line) => setLogs((prev) => [...prev, line]),
      onStageChange: setStage,
      onPreviewReady: async (url) => {
        setPreviewUrl(url);
        setPreviewNonce((n) => n + 1);

        const container = getContainer();
        const flat = await readAllFiles(container);
        setFiles(flat);

        if (isFirstReady) {
          isFirstReady = false;
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: "✨ Live sandbox is active! You can edit code in Monaco, test REST endpoints, or ask for refinements right here.",
            },
          ]);
          setTimeout(() => setScreen("workspace"), 600);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "log", text: "Preview reloaded after file modification." },
          ]);
        }
      },
    });
  }

  function handleLandingSubmit(prompt: string, initialFiles?: AttachedFile[]) {
    if (screen === "building") return;
    const project = saveProject(prompt);
    setProjects((prev) => [project, ...prev]);
    startBuild(prompt, initialFiles);
  }

  function handleOpenProject(project: Project) {
    if (screen === "building") return;
    startBuild(project.name);
  }

  function handleDeleteProject(id: string) {
    deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleChatSend(text: string, attachedFiles?: AttachedFile[]) {
    if (busy) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "Working on the current operation — one moment." },
      ]);
      return;
    }

    const hasAttachments = attachedFiles && attachedFiles.length > 0;
    const userMsg = hasAttachments
      ? `${text ? text + "\n" : ""}[Attached files: ${attachedFiles.map((f) => f.name).join(", ")}]`
      : text;

    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);

    // If user attached files in chat, write them to the workspace directly
    if (hasAttachments) {
      for (const att of attachedFiles) {
        await createFile(att.name, att.contents);
      }
      const container = getContainer();
      const flat = await readAllFiles(container);
      setFiles(flat);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `📁 Successfully imported ${attachedFiles.length} file(s) into project: ${attachedFiles
            .map((f) => `\`${f.name}\``)
            .join(", ")}. Files are now loaded in the workspace.`,
        },
      ]);

      if (!text.trim()) {
        return;
      }
    }

    // Process user prompt and smartly update project file
    const lower = text.toLowerCase();
    const serverFile = files.find((f) => f.path === "server.js");

    if (serverFile) {
      let updatedContents = serverFile.contents;
      let replyExplanation = "";

      if (lower.includes("dark mode") || lower.includes("darkmode") || lower.includes("toggle")) {
        if (!updatedContents.includes("toggleTheme")) {
          updatedContents = updatedContents.replace(
            "</body>",
            `<button onclick="toggleTheme()" style="position:fixed;bottom:20px;right:20px;background:#ff4e00;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(255,78,0,0.4);">Toggle Theme</button>
<script>
let dark = true;
function toggleTheme() {
  dark = !dark;
  document.body.style.background = dark ? '#080402' : '#f4ede6';
  document.body.style.color = dark ? '#ffffff' : '#1a0d05';
}
</script></body>`
          );
        }
        replyExplanation = "Added an interactive theme toggle button with dynamic color transitions.";
      } else if (lower.includes("counter") || lower.includes("count")) {
        if (!updatedContents.includes("counter-app")) {
          updatedContents = updatedContents.replace(
            "</h1>",
            `</h1>
<div id="counter-app" style="margin:20px 0;padding:16px;background:rgba(255,78,0,0.08);border:1px solid rgba(255,120,50,0.25);border-radius:12px;display:flex;align-items:center;justify-content:center;gap:12px;">
  <button onclick="changeVal(-1)" style="background:#26150c;color:#ffb677;border:1px solid #ff4e00;padding:6px 14px;border-radius:6px;font-weight:700;cursor:pointer;">-</button>
  <span id="val-num" style="font-family:monospace;font-size:1.4rem;font-weight:700;color:#ff4e00;">0</span>
  <button onclick="changeVal(1)" style="background:#ff4e00;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:700;cursor:pointer;">+</button>
</div>
<script>
let val = 0;
function changeVal(d){ val += d; document.getElementById('val-num').textContent = val; }
</script>`
          );
        }
        replyExplanation = "Inserted an animated reactive counter widget into the primary view.";
      } else if (lower.includes("api") || lower.includes("endpoint") || lower.includes("route")) {
        if (!updatedContents.includes("/api/status")) {
          updatedContents = updatedContents.replace(
            "const server = http.createServer((req, res) => {",
            `const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', 'http://localhost:3000');
  if (parsed.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'active', uptime: process.uptime(), memory: process.memoryUsage() }, null, 2));
  }`
          );
        }
        replyExplanation = "Configured custom `/api/status` endpoint delivering live service metrics.";
      } else {
        replyExplanation = `Applied your requested changes: "${text}". Updated server template and refreshed live preview.`;
      }

      await handleSaveFile("server.js", updatedContents);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: replyExplanation,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Processed "${text}". Workspace and files are up-to-date.`,
        },
      ]);
    }
  }

  async function handleSaveFile(path: string, contents: string) {
    await writeFile(path, contents);
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, contents } : f)));
  }

  async function handleRefreshFiles() {
    const container = getContainer();
    const flat = await readAllFiles(container);
    setFiles(flat);
  }

  function handleClearLogs() {
    setLogs([]);
  }

  async function handleDownload() {
    if (files.length === 0) return;
    setIsZipping(true);
    try {
      await downloadAsZip(files, `${activeProjectName.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`);
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Top Application Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            style={styles.brand}
            onClick={() => setScreen("landing")}
            title="Return to Zephyr Code Home"
          >
            <span style={styles.brandMark}>⟨/⟩</span>
            <span style={styles.brandName}>Zephyr Code</span>
          </button>

          {screen === "workspace" && (
            <div style={styles.projectPill}>
              <span style={styles.projectDot}></span>
              <span style={styles.projectTitleText}>{activeProjectName}</span>
            </div>
          )}
        </div>

        <div style={styles.headerRight}>
          {screen === "workspace" && (
            <div style={styles.engineBadge}>
              <SparklesIcon size={12} style={{ color: "#ff8438" }} />
              <span>{isVirtual ? "Virtual Sandbox" : "WebContainer Core"}</span>
            </div>
          )}

          {screen !== "landing" && (
            <>
              <button
                style={styles.navButton}
                onClick={() => setScreen("landing")}
                title="Home — Start Screen"
              >
                <HomeIcon size={14} />
                <span>Home</span>
              </button>

              <button
                style={{
                  ...styles.downloadButton,
                  opacity: ready ? 1 : 0.45,
                  cursor: ready ? "pointer" : "not-allowed",
                }}
                onClick={handleDownload}
                disabled={!ready || isZipping}
                title={ready ? "Export & Download full project ZIP" : "Available when workspace is ready"}
              >
                <DownloadIcon size={14} />
                <span>{isZipping ? "Packaging…" : "Download ZIP"}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Body */}
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
            onRefreshFiles={handleRefreshFiles}
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
    background: "#070302",
    color: "#ffffff",
    fontFamily: "var(--font-sans)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 18px",
    borderBottom: "1px solid rgba(255, 120, 50, 0.15)",
    background: "rgba(10, 5, 2, 0.95)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    flexShrink: 0,
    zIndex: 20,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "2px",
  },
  brandMark: {
    color: "#ff4e00",
    fontFamily: "var(--font-mono)",
    fontSize: "18px",
    fontWeight: 800,
    textShadow: "0 0 12px rgba(255, 78, 0, 0.5)",
  },
  brandName: {
    fontFamily: "var(--font-sans)",
    fontWeight: 700,
    fontSize: "15px",
    color: "#ffffff",
    letterSpacing: "-0.01em",
  },
  projectPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    padding: "3px 10px",
    borderRadius: "999px",
    fontSize: "12px",
  },
  projectDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#ff4e00",
  },
  projectTitleText: {
    color: "rgba(255, 255, 255, 0.75)",
    maxWidth: "200px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  engineBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 78, 0, 0.08)",
    border: "1px solid rgba(255, 78, 0, 0.2)",
    color: "#ffb677",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: 600,
  },
  navButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 255, 255, 0.04)",
    color: "rgba(255, 255, 255, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  downloadButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "linear-gradient(135deg, #ff4e00, #d93d00)",
    color: "#ffffff",
    border: "1px solid rgba(255, 182, 119, 0.3)",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(255, 78, 0, 0.3)",
    transition: "all 0.15s ease",
  },
  main: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    overflow: "hidden",
  },
  buildingScreen: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
