import React, { useState } from "react";
import {
  bootProject,
  getContainer,
  writeFile,
  createFile,
  getIsVirtual,
  runGeneratedProject,
  type BootStage,
} from "./webcontainerBoot";
import { generateProject } from "./services/generate";
import { readAllFiles, downloadAsZip, type FlatFile } from "./fileTree";
import { loadProjects, saveProject, updateProjectFiles, deleteProject, type Project, type ProjectFile } from "./utils/projects";
import type { AttachedFile } from "./utils/fileAttachment";
import LandingScreen from "./screens/LandingScreen";
import Workspace, { type ChatMessage } from "./screens/Workspace";
import LogConsole from "./components/LogConsole";
import { DownloadIcon, HomeIcon, SparklesIcon, BrandLogo } from "./components/icons";

type Screen = "landing" | "building" | "workspace";

// Turns a list of file paths into a short, readable phrase for chat
// messages, e.g. "`server.js`, `package.json`, and 3 more".
function formatFileList(paths: string[]): string {
  const unique = Array.from(new Set(paths));
  if (unique.length === 0) return "no files";
  const shown = unique.slice(0, 4).map((p) => `\`${p}\``);
  const extra = unique.length - shown.length;
  return shown.join(", ") + (extra > 0 ? `, and ${extra} more` : "");
}

// Compares the file paths the project had before a chat edit against the
// files the AI actually returned, so file rows can be marked created vs.
// modified in the Action History card.

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string>("Untitled Workspace");
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [stage, setStage] = useState<BootStage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [isChatBusy, setIsChatBusy] = useState(false);

  const ready = stage === "ready";
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";  const isVirtual = getIsVirtual();

  async function startBuild(
    prompt: string,
    attachedFiles?: AttachedFile[],
    opts?: { projectId?: string; cachedFiles?: ProjectFile[] }
  ) {
    let isFirstReady = true;
    setActiveProjectName(prompt.length > 32 ? prompt.slice(0, 32) + "…" : prompt);

    // If we already have a saved snapshot of this project's files, restore
    // them directly instead of calling Gemini again — the AI only needs to
    // run once, on first creation. Every later open (or reopen) is instant.
    const reopening = !!opts?.cachedFiles && opts.cachedFiles.length > 0;

    const attachedSummary =
      attachedFiles && attachedFiles.length > 0
        ? ` with ${attachedFiles.length} attached file(s) (${attachedFiles.map((f) => f.name).join(", ")})`
        : "";

    let aiFiles: { name: string; contents: string }[] = [];
    let featureList: string[] = [];
    const genStartedAt = Date.now();

    if (reopening) {
      aiFiles = opts!.cachedFiles!.map((f) => ({ name: f.path, contents: f.contents }));
      setMessages([
        {
          role: "assistant",
          text: `Welcome back — restoring "${prompt}" from your last session. No need to regenerate anything.`,
        },
      ]);
      setLogs(["Restoring saved project files…"]);
    } else {
      setMessages([
        {
          role: "user",
          text: prompt + (attachedSummary ? `\n[Attached: ${attachedFiles?.map((f) => f.name).join(", ")}]` : ""),
        },
      ]);
      setLogs([]);
    }

    setScreen("building");

    if (!reopening) {
      // Ask Gemini for the REAL project first. bootProject's `initialFiles`
      // hook lets these override the fake generateStarterFiles() templates
      // before anything even mounts — so the very first boot is real too,
      // not just follow-up chat edits.
      try {
        setLogs((prev) => [...prev, "Asking Gemini to generate the project…"]);
        const generated = await generateProject(prompt);
        aiFiles = generated.files.map((f) => ({ name: f.filePath, contents: f.fullContent }));
        featureList = generated.featureList;
        setLogs((prev) => [...prev, `✅ Gemini returned ${generated.files.length} file(s).`]);
      } catch (error: any) {
        const message = error?.message || String(error);
        setLogs((prev) => [...prev, `❌ Generation failed: ${message}`]);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Hit an error generating custom code (${message}) — using a working starter template instead so you're not stuck.`,
          },
        ]);
        // aiFiles stays empty — bootProject falls back to generateStarterFiles().
      }
    }

    // User-attached files are applied AFTER the AI's files, so an explicit
    // attachment always wins over anything Gemini produced with the same name.
    const mergedInitialFiles = [
      ...aiFiles,
      ...(attachedFiles?.map((f) => ({ name: f.name, contents: f.contents })) ?? []),
    ];

    await bootProject({
      prompt,
      initialFiles: mergedInitialFiles.length > 0 ? mergedInitialFiles : undefined,
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

          if (opts?.projectId) {
            updateProjectFiles(opts.projectId, flat);
          }

          if (reopening) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", text: "Preview is live. Ready to keep building?" },
            ]);
          } else {
            const elapsed = Math.max(1, Math.round((Date.now() - genStartedAt) / 1000));
            const readyText =
              featureList.length > 0
                ? `Built with: ${featureList.join(", ")}. Tell me what to add or change next.`
                : "Your project is ready — tell me what to add or change next.";
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                text: readyText,
                actionLabel: "Action history",
                meta: `Gemini • Ran for ${elapsed}s`,
                fileChanges: flat.map((f) => ({ path: f.path, status: "created" as const })),
              },
            ]);
          }
          setTimeout(() => setScreen("workspace"), reopening ? 150 : 500);
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
    setActiveProjectId(project.id);
    startBuild(prompt, initialFiles, { projectId: project.id });
  }

  function handleOpenProject(project: Project) {
    if (screen === "building") return;
    setActiveProjectId(project.id);
    startBuild(project.name, undefined, {
      projectId: project.id,
      cachedFiles: project.files && project.files.length > 0 ? project.files : undefined,
    });
  }

  function handleDeleteProject(id: string) {
    deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleChatSend(text: string, attachedFiles?: AttachedFile[]) {
    if (busy || isChatBusy) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "Still finishing the last request — I'll pick this up right after." },
      ]);
      return;
    }

    const hasAttachments = attachedFiles && attachedFiles.length > 0;
    const userMsg = hasAttachments
      ? `${text ? text + "\n" : ""}[Attached files: ${attachedFiles.map((f) => f.name).join(", ")}]`
      : text;

    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsChatBusy(true);

    try {
      // If user attached files in chat, write them to the workspace directly
      if (hasAttachments) {
        for (const att of attachedFiles) {
          await createFile(att.name, att.contents);
        }
        const container = getContainer();
        const flat = await readAllFiles(container);
        setFiles(flat);
        if (activeProjectId) updateProjectFiles(activeProjectId, flat);
      }

      if (!text.trim()) return;

      // Snapshot of what existed before this edit, so we can tell the person
      // which files were newly created vs. modified once the AI responds.
      const previousPaths = new Set(files.map((f) => f.path));
      const startedAt = Date.now();

      // Send the AI the CURRENT project files, not just the raw instruction.
      // Without this, every message — even "rename it X" or a plain
      // question — looked like a request to build a brand new app from
      // scratch, because the model had no idea a project already existed.
      const result = await generateProject(
        text,
        files.map((f) => ({ path: f.path, contents: f.contents }))
      );
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

      if (result.files.length === 0) {
        // No code needed to change — this was a question, or something
        // about deployment/config outside the app itself. Just answer in
        // chat instead of forcing an unrelated app into existence.
        setMessages((prev) => [...prev, { role: "assistant", text: result.reply || "Got it." }]);
        return;
      }

      await runGeneratedProject(result.files, (line) => setLogs((prev) => [...prev, line]));

      const container = getContainer();
      const flat = await readAllFiles(container);
      setFiles(flat);
      if (activeProjectId) updateProjectFiles(activeProjectId, flat);

      const fileChanges = result.files.map((f) => ({
        path: f.filePath,
        status: previousPaths.has(f.filePath) ? ("modified" as const) : ("created" as const),
      }));

      // Prefer the model's own account of what it did; only fall back to
      // an auto-generated file list if it didn't give one.
      const explanation =
        result.reply ||
        (fileChanges.length > 1 ? `Updated ${formatFileList(fileChanges.map((f) => f.path))} to handle that.` : "");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: explanation,
          actionLabel: "Action history",
          meta: `Gemini • Ran for ${elapsed}s`,
          fileChanges,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Ran into an issue: ${error?.message || String(error)}. Nothing was changed — try rephrasing and I'll give it another shot.`,
        },
      ]);
    } finally {
      setIsChatBusy(false);
    }
  }

  async function handleSaveFile(path: string, contents: string) {
    await writeFile(path, contents);
    setFiles((prev) => {
      const updated = prev.map((f) => (f.path === path ? { ...f, contents } : f));
      if (activeProjectId) updateProjectFiles(activeProjectId, updated);
      return updated;
    });
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: "I made some changes.",
        actionLabel: "Manual edit",
        fileChanges: [{ path, status: "modified" }],
      },
    ]);
  }

  async function handleRefreshFiles() {
    const container = getContainer();
    const flat = await readAllFiles(container);
    setFiles(flat);
    // BUG FIX: creating/uploading/deleting files via the explorer only ever
    // called this refresh, never persisted the result — so those changes
    // were silently lost the next time the project was reopened (only
    // Monaco saves and chat edits were being cached). Now every path that
    // mutates the file tree ends up here, so all of them get saved.
    if (activeProjectId) updateProjectFiles(activeProjectId, flat);
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
            title="Home"
          >
            <BrandLogo size={22} />
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
            busy={busy || isChatBusy}
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
