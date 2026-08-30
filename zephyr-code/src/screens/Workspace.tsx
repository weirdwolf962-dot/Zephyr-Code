import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { FlatFile } from "../fileTree";
import { languageFromPath } from "../utils/language";
import {
  SaveIcon,
  PreviewIcon,
  CodeIcon,
  SplitIcon,
  RefreshIcon,
  ExternalLinkIcon,
  PlusIcon,
  TrashIcon,
  CloseIcon,
  SparklesIcon,
  DesktopIcon,
  TabletIcon,
  MobileIcon,
  SendIcon,
  MicIcon,
  UploadIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FolderClosedIcon,
  getFileIcon,
} from "../components/icons";
import BuildConsole from "../components/BuildConsole";
import { FileAttachmentBar } from "../components/FileExtensionPicker";
import { createFile, deleteFile } from "../webcontainerBoot";
import {
  COMMON_EXTENSIONS,
  readUploadedFiles,
  type AttachedFile,
} from "../utils/fileAttachment";

// ---- Folder-tree helpers (item 7) ------------------------------------
// Flat file paths like "public/index.html" get turned into a real nested
// tree so the explorer can render actual folders instead of one row per
// file with a literal "/" in its name.
interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildFileTree(files: FlatFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const f of files) {
    const parts = f.path.split("/");
    let siblings = root;
    let currentPath = "";
    parts.forEach((part, i) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = siblings.find((n) => n.name === part && n.isFile === isFile);
      if (!node) {
        node = { name: part, path: currentPath, isFile, children: [] };
        siblings.push(node);
      }
      siblings = node.children;
    });
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function FileTreeView({
  nodes,
  depth,
  activeFilePath,
  buffers,
  filesByPath,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  onDeleteFile,
}: {
  nodes: TreeNode[];
  depth: number;
  activeFilePath: string | null;
  buffers: Record<string, string>;
  filesByPath: Map<string, string>;
  collapsedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onDeleteFile: (e: React.MouseEvent, path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const indent = 10 + depth * 14;
        if (!node.isFile) {
          const collapsed = collapsedFolders.has(node.path);
          return (
            <div key={node.path}>
              <div
                onClick={() => onToggleFolder(node.path)}
                style={{ ...styles.fileRowItem, paddingLeft: `${indent}px`, color: "rgba(255,255,255,0.6)" }}
              >
                <div style={styles.fileNameWithIcon}>
                  {collapsed ? <ChevronRightIcon size={12} /> : <ChevronDownIcon size={12} />}
                  <FolderClosedIcon size={13} style={{ color: "#ffb677" }} />
                  <span style={styles.filePathText}>{node.name}</span>
                </div>
              </div>
              {!collapsed && (
                <FileTreeView
                  nodes={node.children}
                  depth={depth + 1}
                  activeFilePath={activeFilePath}
                  buffers={buffers}
                  filesByPath={filesByPath}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  onDeleteFile={onDeleteFile}
                />
              )}
            </div>
          );
        }

        const original = filesByPath.get(node.path) ?? "";
        const dirty = buffers[node.path] !== undefined && buffers[node.path] !== original;
        const isActive = node.path === activeFilePath;
        return (
          <div
            key={node.path}
            onClick={() => onSelectFile(node.path)}
            style={{
              ...styles.fileRowItem,
              paddingLeft: `${indent}px`,
              background: isActive ? "rgba(255, 78, 0, 0.12)" : "transparent",
              color: isActive ? "#ffb677" : "rgba(255, 255, 255, 0.7)",
              borderLeft: isActive ? "2px solid #ff4e00" : "2px solid transparent",
            }}
          >
            <div style={styles.fileNameWithIcon}>
              {getFileIcon(node.path, 13)}
              <span style={styles.filePathText}>{node.name}</span>
            </div>
            <div style={styles.fileRowActions}>
              {dirty && <span style={styles.dirtyDot}>●</span>}
              <button style={styles.deleteFileIconBtn} onClick={(e) => onDeleteFile(e, node.path)} title="Delete file">
                <TrashIcon size={11} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Renders backtick-wrapped text as inline code, so the assistant's messages
// about which files it touched (item 6) read like a real coding chat.
function renderWithInlineCode(text: string) {
  const segments = text.split(/(`[^`]+`)/g);
  return segments.map((seg, idx) => {
    if (seg.length > 1 && seg.startsWith("`") && seg.endsWith("`")) {
      return (
        <code key={idx} style={styles.inlineCode}>
          {seg.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{seg}</React.Fragment>;
  });
}

export type ChatRole = "user" | "assistant" | "log";
export interface ChatMessage {
  role: ChatRole;
  text: string;
}

interface WorkspaceProps {
  messages: ChatMessage[];
  onSend: (text: string, attachedFiles?: AttachedFile[]) => void;
  busy: boolean;
  previewUrl: string | null;
  previewNonce: number;
  files: FlatFile[];
  onSaveFile: (path: string, contents: string) => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  logs: string[];
  onClearLogs: () => void;
}

type ViewMode = "preview" | "code" | "split";
type DevicePreset = "responsive" | "desktop" | "tablet" | "mobile";
type SaveState = "idle" | "dirty" | "saving" | "saved";

export default function Workspace({
  messages,
  onSend,
  busy,
  previewUrl,
  previewNonce,
  files,
  onSaveFile,
  onRefreshFiles,
  logs,
  onClearLogs,
}: WorkspaceProps) {
  const [input, setInput] = useState("");
  const [chatAttachedFiles, setChatAttachedFiles] = useState<AttachedFile[]>([]);
  const [isChatDragging, setIsChatDragging] = useState(false);
  const [isExplorerDragging, setIsExplorerDragging] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [device, setDevice] = useState<DevicePreset>("responsive");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<() => void>(() => {});
  const explorerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync open files and default active file
  useEffect(() => {
    if (files.length > 0) {
      if (!activeFilePath || !files.some((f) => f.path === activeFilePath)) {
        const defaultFile = files.find((f) => f.path === "server.js" || f.path === "index.html") || files[0];
        setActiveFilePath(defaultFile.path);
        setOpenTabs((prev) => (prev.includes(defaultFile.path) ? prev : [defaultFile.path, ...prev]));
      }
    }
  }, [files, activeFilePath]);

  const activeFile = files.find((f) => f.path === activeFilePath) ?? null;
  const bufferValue = activeFilePath ? buffers[activeFilePath] ?? activeFile?.contents ?? "" : "";
  const isDirty = activeFile ? bufferValue !== activeFile.contents : false;

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const filesByPath = useMemo(() => new Map(files.map((f) => [f.path, f.contents])), [files]);

  function toggleFolder(path: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleSelectFile(path: string) {
    setActiveFilePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
  }

  function handleCloseTab(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(nextTabs);
    if (activeFilePath === path) {
      setActiveFilePath(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null);
    }
  }

  function handleSend(customText?: string) {
    const text = (customText !== undefined ? customText : input).trim();
    if (!text && chatAttachedFiles.length === 0) return;
    const toSend = [...chatAttachedFiles];
    setInput("");
    setChatAttachedFiles([]);
    onSend(text, toSend);
  }

  function handleEditorChange(value: string | undefined) {
    if (!activeFilePath) return;
    setBuffers((prev) => ({ ...prev, [activeFilePath]: value ?? "" }));
    setSaveState("dirty");
  }

  async function handleSaveActive() {
    if (!activeFilePath) return;
    const content = buffers[activeFilePath] !== undefined ? buffers[activeFilePath] : activeFile?.contents ?? "";
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

  async function handleCreateNewFile(customTemplate?: string) {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.includes(".")) {
      name += ".js";
    }
    const extMatch = COMMON_EXTENSIONS.find((e) => name.endsWith(e.ext));
    const content = customTemplate || extMatch?.template || `// ${name}\n`;

    await createFile(name, content);
    await onRefreshFiles();
    setOpenTabs((prev) => [...prev, name]);
    setActiveFilePath(name);
    setNewFileName("");
    setIsCreatingFile(false);
  }

  async function handleExplorerFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const uploaded = await readUploadedFiles(fileList);
    for (const f of uploaded) {
      await createFile(f.name, f.contents);
    }
    await onRefreshFiles();
    if (uploaded.length > 0) {
      const last = uploaded[uploaded.length - 1].name;
      setOpenTabs((prev) => (prev.includes(last) ? prev : [...prev, last]));
      setActiveFilePath(last);
    }
    if (explorerFileInputRef.current) {
      explorerFileInputRef.current.value = "";
    }
  }

  async function handleExplorerDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsExplorerDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleExplorerFileUpload(e.dataTransfer.files);
    }
  }

  async function handleChatFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const uploaded = await readUploadedFiles(fileList);
    setChatAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const filtered = uploaded.filter((f) => !existingNames.has(f.name));
      return [...prev, ...filtered];
    });
  }

  async function handleChatDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsChatDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleChatFileUpload(e.dataTransfer.files);
    }
  }

  async function handleDeleteFile(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    if (files.length <= 1) {
      alert("Cannot delete the last remaining file in workspace.");
      return;
    }
    if (confirm(`Delete ${path}?`)) {
      await deleteFile(path);
      await onRefreshFiles();
      setOpenTabs((prev) => prev.filter((t) => t !== path));
      if (activeFilePath === path) {
        const remaining = files.filter((f) => f.path !== path);
        setActiveFilePath(remaining[0]?.path ?? null);
      }
    }
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Custom Zephyr Dark Theme
    monaco.editor.defineTheme("zephyr-obsidian", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", background: "0a0502", foreground: "e6e6e6" },
        { token: "keyword", foreground: "ff702e", fontStyle: "bold" },
        { token: "string", foreground: "38bdf8" },
        { token: "number", foreground: "ffb677" },
        { token: "comment", foreground: "737373", fontStyle: "italic" },
        { token: "identifier", foreground: "f3f4f6" },
        { token: "type", foreground: "facc15" },
        { token: "function", foreground: "fb923c" },
      ],
      colors: {
        "editor.background": "#0a0502",
        "editor.foreground": "#f3f4f6",
        "editor.lineHighlightBackground": "#160c07",
        "editorCursor.foreground": "#ff4e00",
        "editorWhitespace.foreground": "#26150c",
        "editorIndentGuide.background": "#1e1008",
        "editorIndentGuide.activeBackground": "#ff4e0040",
        "editorLineNumber.foreground": "#4b2c1b",
        "editorLineNumber.activeForeground": "#ffb677",
      },
    });
    monaco.editor.setTheme("zephyr-obsidian");

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });
  };

  const getPreviewWidth = () => {
    switch (device) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      case "desktop":
        return "1024px";
      default:
        return "100%";
    }
  };

  return (
    <div style={styles.workspace}>
      {/* Hidden file input for the explorer's own upload button */}
      <input
        ref={explorerFileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleExplorerFileUpload(e.target.files)}
      />

      {/* Left Pane: AI Chat Assistant */}
      <section
        style={{
          ...styles.leftPane,
          borderColor: isChatDragging ? "#ff4e00" : "rgba(255, 120, 50, 0.15)",
          background: isChatDragging ? "rgba(255, 78, 0, 0.04)" : "#0a0502",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsChatDragging(true);
        }}
        onDragLeave={() => setIsChatDragging(false)}
        onDrop={handleChatDrop}
      >
        {/* Assistant Header */}
        <div style={styles.assistantHeader}>
          <div style={styles.assistantHeaderLeft}>
            <div style={styles.assistantAvatar}>
              <SparklesIcon size={13} style={{ color: "#ff8438" }} />
            </div>
            <div>
              <div style={styles.assistantName}>Zephyr Assistant</div>
              <div style={styles.assistantStatus}>
                <span style={styles.statusDot}></span> Live Engine Connected
              </div>
            </div>
          </div>
        </div>

        {/* Chat Scroll Area */}
        <div style={styles.chatScroll}>
          {messages.length === 0 && !busy ? (
            <div style={styles.emptyChatState}>
              <div style={styles.emptyChatOrb}>
                <SparklesIcon size={20} style={{ color: "#ff8438" }} />
              </div>
              <p style={styles.emptyChatGreeting}>How may the winds guide you?</p>
            </div>
          ) : (
            messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} />)
          )}

          {busy && (
            <div style={styles.typingIndicator}>
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
              <span style={{ fontSize: "11.5px", color: "#ffb677", marginLeft: "6px" }}>
                Processing request…
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick prompt suggestions */}
        <div style={styles.quickPromptsRow}>
          <button
            style={styles.quickChip}
            onClick={() => handleSend("Add a dark mode toggle to the webpage with smooth transitions")}
          >
            + Dark mode toggle
          </button>
          <button
            style={styles.quickChip}
            onClick={() => handleSend("Add a /api/status endpoint returning uptime and CPU stats")}
          >
            + Status endpoint
          </button>
          <button
            style={styles.quickChip}
            onClick={() => handleSend("Add interactive counter with animation")}
          >
            + Interactive counter
          </button>
        </div>

        {/* Chat Input */}
        <div style={styles.inputBarWrapper}>
          <FileAttachmentBar
            attachedFiles={chatAttachedFiles}
            onAddFiles={(newFiles) =>
              setChatAttachedFiles((prev) => {
                const existing = new Set(prev.map((f) => f.name));
                return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
              })
            }
            onRemoveFile={(name) => setChatAttachedFiles((prev) => prev.filter((f) => f.name !== name))}
            iconOnly
          />

          <div style={styles.inputPill}>
            <input
              style={styles.pillInput}
              placeholder={isChatDragging ? "Drop files to attach..." : "Ask Zephyr…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={busy}
            />
            <button style={styles.pillIconBtn} title="Voice input (coming soon)" onClick={() => {}}>
              <MicIcon size={14} />
            </button>
            <button
              style={styles.pillSendBtn}
              onClick={() => handleSend()}
              disabled={busy || (!input.trim() && chatAttachedFiles.length === 0)}
              title="Send instructions"
            >
              <SendIcon size={14} />
            </button>
          </div>

          <div style={styles.disclaimerText}>Zephyr can make mistakes. Check important information.</div>
        </div>
      </section>

      {/* Right Pane: Workspace Controls, Code, and Preview */}
      <section style={styles.rightPane}>
        {/* Workspace Toolbar */}
        <div style={styles.topToolbar}>
          {/* View Mode Switcher */}
          <div style={styles.viewModeGroup}>
            <button
              style={{
                ...styles.modeBtn,
                ...(viewMode === "split" ? styles.modeBtnActive : {}),
              }}
              onClick={() => setViewMode("split")}
              title="Split View (Code + Preview)"
            >
              <SplitIcon size={13} />
              <span>Split</span>
            </button>
            <button
              style={{
                ...styles.modeBtn,
                ...(viewMode === "code" ? styles.modeBtnActive : {}),
              }}
              onClick={() => setViewMode("code")}
              title="Code Editor Full"
            >
              <CodeIcon size={13} />
              <span>Code</span>
            </button>
            <button
              style={{
                ...styles.modeBtn,
                ...(viewMode === "preview" ? styles.modeBtnActive : {}),
              }}
              onClick={() => setViewMode("preview")}
              title="Live Preview Full"
            >
              <PreviewIcon size={13} />
              <span>Preview</span>
            </button>
          </div>

          {/* Preview Device Controls (shown if preview is visible) */}
          {viewMode !== "code" && (
            <div style={styles.deviceControls}>
              <button
                style={{
                  ...styles.deviceBtn,
                  ...(device === "responsive" ? styles.deviceBtnActive : {}),
                }}
                onClick={() => setDevice("responsive")}
                title="Full Responsive"
              >
                <span>Full</span>
              </button>
              <button
                style={{
                  ...styles.deviceBtn,
                  ...(device === "desktop" ? styles.deviceBtnActive : {}),
                }}
                onClick={() => setDevice("desktop")}
                title="Desktop View (1024px)"
              >
                <DesktopIcon size={13} />
              </button>
              <button
                style={{
                  ...styles.deviceBtn,
                  ...(device === "tablet" ? styles.deviceBtnActive : {}),
                }}
                onClick={() => setDevice("tablet")}
                title="Tablet View (768px)"
              >
                <TabletIcon size={13} />
              </button>
              <button
                style={{
                  ...styles.deviceBtn,
                  ...(device === "mobile" ? styles.deviceBtnActive : {}),
                }}
                onClick={() => setDevice("mobile")}
                title="Mobile View (375px)"
              >
                <MobileIcon size={13} />
              </button>
            </div>
          )}

          {/* Right actions: reload, external tab, save status */}
          <div style={styles.topToolbarRight}>
            {viewMode !== "code" && (
              <>
                <button
                  style={styles.toolbarIconBtn}
                  onClick={() => setIframeKey((k) => k + 1)}
                  title="Reload Preview Frame"
                >
                  <RefreshIcon size={13} />
                </button>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.toolbarIconBtn}
                    title="Open Preview in New Browser Tab"
                  >
                    <ExternalLinkIcon size={13} />
                  </a>
                )}
              </>
            )}

            {activeFile && (
              <button
                style={{
                  ...styles.saveActionButton,
                  opacity: isDirty || saveState === "saving" ? 1 : 0.6,
                }}
                onClick={handleSaveActive}
                disabled={!isDirty && saveState === "idle"}
                title="Save File (Ctrl/Cmd+S)"
              >
                <SaveIcon size={12} />
                <span>
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "saved"
                    ? "Saved"
                    : isDirty
                    ? "Save *"
                    : "Saved"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div style={styles.mainContent}>
          {/* Code Section */}
          {(viewMode === "code" || viewMode === "split") && (
            <div
              style={{
                ...styles.codeContainer,
                width: viewMode === "split" ? "50%" : "100%",
                borderRight: viewMode === "split" ? "1px solid rgba(255, 120, 50, 0.15)" : "none",
              }}
            >
              <div style={styles.editorFileRow}>
                {/* File Explorer Sidebar */}
                <div
                  style={{
                    ...styles.fileExplorer,
                    borderColor: isExplorerDragging ? "#ff4e00" : "rgba(255, 255, 255, 0.06)",
                    background: isExplorerDragging ? "rgba(255, 78, 0, 0.06)" : "#0a0502",
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsExplorerDragging(true);
                  }}
                  onDragLeave={() => setIsExplorerDragging(false)}
                  onDrop={handleExplorerDrop}
                >
                  <div style={styles.fileExplorerTop}>
                    <span style={styles.explorerTitle}>Files</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        style={styles.explorerIconActionBtn}
                        onClick={() => explorerFileInputRef.current?.click()}
                        title="Upload files from your computer"
                      >
                        <UploadIcon size={12} />
                      </button>
                      <button
                        style={styles.newFileBtn}
                        onClick={() => setIsCreatingFile(true)}
                        title="Add New File"
                      >
                        <PlusIcon size={12} />
                      </button>
                    </div>
                  </div>

                  {isCreatingFile && (
                    <div style={styles.newFileInputContainer}>
                      <div style={styles.newFileInputRow}>
                        <input
                          type="text"
                          placeholder="filename.js"
                          value={newFileName}
                          autoFocus
                          onChange={(e) => setNewFileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateNewFile();
                            if (e.key === "Escape") setIsCreatingFile(false);
                          }}
                          style={styles.newFileInput}
                        />
                        <button style={styles.newFileConfirm} onClick={() => handleCreateNewFile()}>
                          ✓
                        </button>
                        <button style={styles.newFileCancel} onClick={() => setIsCreatingFile(false)}>
                          ✕
                        </button>
                      </div>

                      {/* File Extension Selector Chips */}
                      <div style={styles.quickExtSelectorRow}>
                        <span style={styles.extHintLabel}>Extensions:</span>
                        {COMMON_EXTENSIONS.map((item) => (
                          <button
                            key={item.ext}
                            type="button"
                            style={styles.extBadgeBtn}
                            onClick={() => {
                              const base = newFileName.split(".")[0] || "file";
                              setNewFileName(`${base}${item.ext}`);
                            }}
                            title={`Use ${item.label} template`}
                          >
                            <span style={{ color: item.color }}>{item.ext}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={styles.fileList}>
                    <FileTreeView
                      nodes={fileTree}
                      depth={0}
                      activeFilePath={activeFilePath}
                      buffers={buffers}
                      filesByPath={filesByPath}
                      collapsedFolders={collapsedFolders}
                      onToggleFolder={toggleFolder}
                      onSelectFile={handleSelectFile}
                      onDeleteFile={handleDeleteFile}
                    />
                  </div>
                </div>

                {/* Monaco Editor Panel */}
                <div style={styles.editorPanel}>
                  {/* Open Tabs */}
                  <div style={styles.tabsHeader}>
                    {openTabs.map((tabPath) => {
                      const isActive = tabPath === activeFilePath;
                      const isFileDirty =
                        buffers[tabPath] !== undefined &&
                        buffers[tabPath] !== files.find((f) => f.path === tabPath)?.contents;
                      return (
                        <div
                          key={tabPath}
                          onClick={() => setActiveFilePath(tabPath)}
                          style={{
                            ...styles.editorTabItem,
                            background: isActive ? "#0a0502" : "#0e0805",
                            color: isActive ? "#ffb677" : "rgba(255, 255, 255, 0.5)",
                            borderTop: isActive ? "2px solid #ff4e00" : "2px solid transparent",
                          }}
                        >
                          {getFileIcon(tabPath, 12)}
                          <span style={styles.tabName}>{tabPath}</span>
                          {isFileDirty && <span style={styles.dirtyDot}>●</span>}
                          <button
                            style={styles.closeTabBtn}
                            onClick={(e) => handleCloseTab(e, tabPath)}
                          >
                            <CloseIcon size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Editor View */}
                  <div style={styles.monacoWrapper}>
                    {activeFile ? (
                      <Editor
                        key={activeFile.path}
                        language={languageFromPath(activeFile.path)}
                        value={bufferValue}
                        theme="zephyr-obsidian"
                        onChange={handleEditorChange}
                        onMount={handleEditorMount}
                        options={{
                          fontSize: 13,
                          fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
                          fontLigatures: true,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          cursorBlinking: "smooth",
                          cursorSmoothCaretAnimation: "on",
                          renderLineHighlight: "all",
                          lineNumbersMinChars: 3,
                          padding: { top: 12, bottom: 12 },
                        }}
                      />
                    ) : (
                      <div style={styles.emptyEditor}>
                        <p style={styles.emptyEditorText}>Select a file from the explorer to edit.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Build Console */}
              <BuildConsole logs={logs} onClear={onClearLogs} />
            </div>
          )}

          {/* Live Preview Section */}
          {(viewMode === "preview" || viewMode === "split") && (
            <div
              style={{
                ...styles.previewContainer,
                width: viewMode === "split" ? "50%" : "100%",
              }}
            >
              <div style={styles.previewStage}>
                <div
                  style={{
                    ...styles.deviceFrame,
                    width: getPreviewWidth(),
                  }}
                >
                  {previewUrl ? (
                    <iframe
                      key={`${previewUrl}-${previewNonce}-${iframeKey}`}
                      src={previewUrl}
                      title="Zephyr Live Preview"
                      style={styles.iframe}
                      sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups"
                    />
                  ) : (
                    <div style={styles.previewLoading}>
                      <div style={styles.previewLoadingOrb}></div>
                      <p style={styles.previewLoadingText}>Initializing sandbox preview…</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChatBubble({ role, text }: ChatMessage) {
  if (role === "log") {
    return (
      <div style={styles.logLine}>
        <span style={styles.logTag}>LOG</span>
        <span>{text}</span>
      </div>
    );
  }
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? styles.userBubble : styles.assistantBubble}>
        <div style={styles.bubbleText}>{renderWithInlineCode(text)}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  workspace: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    width: "100%",
    height: "100%",
    background: "#070302",
    overflow: "hidden",
  },
  leftPane: {
    width: "440px",
    minWidth: "380px",
    maxWidth: "560px",
    borderRight: "1px solid rgba(255, 120, 50, 0.15)",
    background: "#0a0502",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    flexShrink: 0,
  },
  assistantHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#0d0704",
    flexShrink: 0,
  },
  assistantHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  assistantAvatar: {
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    background: "rgba(255, 78, 0, 0.15)",
    border: "1px solid rgba(255, 120, 50, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  assistantName: {
    fontSize: "12.5px",
    fontWeight: 700,
    color: "#ffffff",
  },
  assistantStatus: {
    fontSize: "10.5px",
    color: "rgba(255, 255, 255, 0.45)",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    marginTop: "1px",
  },
  statusDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "#22c55e",
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: 0,
  },
  userBubble: {
    background: "rgba(255, 78, 0, 0.15)",
    border: "1px solid rgba(255, 120, 50, 0.3)",
    color: "#ffffff",
    borderRadius: "14px 14px 2px 14px",
    padding: "10px 14px",
    fontSize: "13px",
    lineHeight: 1.5,
    maxWidth: "88%",
    boxShadow: "0 4px 12px rgba(255, 78, 0, 0.08)",
  },
  assistantBubble: {
    background: "#120a06",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "rgba(255, 255, 255, 0.88)",
    borderRadius: "14px 14px 14px 2px",
    padding: "10px 14px",
    fontSize: "13px",
    lineHeight: 1.5,
    maxWidth: "88%",
  },
  bubbleText: {
    wordBreak: "break-word",
  },
  inlineCode: {
    background: "rgba(255,255,255,0.1)",
    padding: "1px 5px",
    borderRadius: "4px",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
  },
  emptyChatState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    textAlign: "center",
    padding: "20px",
  },
  emptyChatOrb: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "rgba(255, 78, 0, 0.12)",
    border: "1px solid rgba(255, 120, 50, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChatGreeting: {
    fontFamily: "var(--font-serif)",
    fontStyle: "italic",
    fontSize: "20px",
    color: "rgba(255, 255, 255, 0.45)",
  },
  logLine: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
    color: "rgba(255, 182, 119, 0.7)",
    padding: "2px 6px",
    background: "rgba(255, 78, 0, 0.05)",
    borderRadius: "6px",
    border: "1px solid rgba(255, 78, 0, 0.1)",
  },
  logTag: {
    fontSize: "9px",
    fontWeight: 700,
    background: "rgba(255, 78, 0, 0.2)",
    color: "#ffb677",
    padding: "1px 4px",
    borderRadius: "3px",
  },
  typingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "8px 12px",
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "10px",
    width: "fit-content",
  },
  quickPromptsRow: {
    padding: "8px 12px",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    borderTop: "1px solid rgba(255, 255, 255, 0.04)",
    background: "#080402",
  },
  quickChip: {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "10.5px",
    color: "rgba(255, 255, 255, 0.6)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
  },
  rightPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  topToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    background: "#0c0704",
    borderBottom: "1px solid rgba(255, 120, 50, 0.15)",
    flexShrink: 0,
    gap: "12px",
  },
  viewModeGroup: {
    display: "flex",
    alignItems: "center",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "8px",
    padding: "2px",
    gap: "2px",
  },
  modeBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.5)",
    border: "none",
    borderRadius: "6px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  modeBtnActive: {
    background: "rgba(255, 78, 0, 0.16)",
    color: "#ffb677",
  },
  deviceControls: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    padding: "2px",
  },
  deviceBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.4)",
    borderRadius: "5px",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceBtnActive: {
    background: "rgba(255, 255, 255, 0.08)",
    color: "#fff",
  },
  topToolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  toolbarIconBtn: {
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "rgba(255, 255, 255, 0.6)",
    borderRadius: "7px",
    width: "30px",
    height: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    textDecoration: "none",
    transition: "all 0.15s",
  },
  saveActionButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "linear-gradient(135deg, #ff4e00, #d93d00)",
    color: "#fff",
    border: "1px solid rgba(255, 182, 119, 0.3)",
    borderRadius: "7px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(255, 78, 0, 0.25)",
  },
  mainContent: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    minWidth: 0,
  },
  codeContainer: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    background: "#080402",
  },
  editorFileRow: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  fileExplorer: {
    width: "220px",
    borderRight: "1px solid rgba(255, 255, 255, 0.06)",
    background: "#0a0502",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    flexShrink: 0,
  },
  fileExplorerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px 6px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
  },
  explorerTitle: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.4)",
  },
  newFileBtn: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "4px",
    color: "#ffb677",
    cursor: "pointer",
    padding: "3px 6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  explorerIconActionBtn: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "4px",
    color: "#ffb677",
    cursor: "pointer",
    padding: "3px 6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  newFileInputContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    background: "#120804",
    padding: "6px 8px",
    borderBottom: "1px solid rgba(255, 120, 50, 0.2)",
  },
  newFileInputRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  quickExtSelectorRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "3px",
    alignItems: "center",
    paddingTop: "2px",
  },
  extHintLabel: {
    fontSize: "9px",
    color: "rgba(255, 255, 255, 0.4)",
    marginRight: "2px",
  },
  extBadgeBtn: {
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "3px",
    padding: "1px 4px",
    fontSize: "9.5px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
  },
  newFileInput: {
    flex: 1,
    background: "#000",
    border: "1px solid #ff4e00",
    color: "#fff",
    fontSize: "11px",
    padding: "3px 5px",
    borderRadius: "4px",
    outline: "none",
  },
  newFileConfirm: {
    background: "#ff4e00",
    color: "#fff",
    border: "none",
    borderRadius: "3px",
    fontSize: "10px",
    cursor: "pointer",
    padding: "2px 5px",
  },
  newFileCancel: {
    background: "transparent",
    color: "#fff",
    border: "none",
    fontSize: "10px",
    cursor: "pointer",
  },
  fileList: {
    padding: "6px 0",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  fileRowItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    userSelect: "none",
  },
  fileNameWithIcon: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    overflow: "hidden",
  },
  filePathText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileRowActions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  dirtyDot: {
    color: "#ff4e00",
    fontSize: "9px",
  },
  deleteFileIconBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.2)",
    cursor: "pointer",
    padding: "2px",
  },
  editorPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  tabsHeader: {
    display: "flex",
    alignItems: "center",
    background: "#0e0805",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    overflowX: "auto",
    flexShrink: 0,
  },
  editorTabItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    borderRight: "1px solid rgba(255, 255, 255, 0.05)",
  },
  tabName: {
    maxWidth: "140px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  closeTabBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.3)",
    cursor: "pointer",
    padding: "1px",
    display: "flex",
    alignItems: "center",
  },
  monacoWrapper: {
    flex: 1,
    minHeight: 0,
    background: "#0a0502",
  },
  emptyEditor: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyEditorText: {
    color: "rgba(255, 255, 255, 0.3)",
    fontSize: "13px",
  },
  previewContainer: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    background: "#060302",
  },
  previewStage: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px",
    minHeight: 0,
    overflow: "auto",
  },
  deviceFrame: {
    height: "100%",
    maxHeight: "100%",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 120, 50, 0.15)",
    background: "#0a0502",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.25s ease",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#080402",
  },
  previewLoading: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
  },
  previewLoadingOrb: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "2px solid rgba(255, 78, 0, 0.2)",
    borderTopColor: "#ff4e00",
    animation: "spin 1s linear infinite",
  },
  previewLoadingText: {
    fontSize: "12.5px",
    color: "rgba(255, 255, 255, 0.5)",
  },
  inputBarWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px 14px 12px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    background: "#0d0704",
    flexShrink: 0,
  },
  inputPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "999px",
    padding: "6px 8px 6px 16px",
  },
  pillInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "var(--font-sans)",
  },
  pillIconBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.5)",
    cursor: "pointer",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pillSendBtn: {
    background: "linear-gradient(135deg, #ff4e00, #d93d00)",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: "30px",
    height: "30px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 10px rgba(255, 78, 0, 0.3)",
    flexShrink: 0,
  },
  disclaimerText: {
    fontSize: "10px",
    color: "rgba(255, 255, 255, 0.3)",
    textAlign: "center",
  },
};
