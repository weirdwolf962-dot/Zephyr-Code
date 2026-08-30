import React, { useState } from "react";
import type { Project } from "../utils/projects";
import { formatRelativeTime } from "../utils/projects";
import {
  TrashIcon,
  SparklesIcon,
  PlayIcon,
  TerminalIcon,
  ZapIcon,
  SendIcon,
  CodeIcon,
} from "../components/icons";
import { FileAttachmentBar } from "../components/FileExtensionPicker";
import { readUploadedFiles, type AttachedFile } from "../utils/fileAttachment";

interface LandingScreenProps {
  projects: Project[];
  onSubmit: (prompt: string, initialFiles?: AttachedFile[]) => void;
  onOpenProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
}

const STARTER_PRESETS = [
  {
    title: "Weather App",
    desc: "Search any city and see the current temperature and forecast",
    prompt: "Build a simple weather app where I can search for a city and see the current temperature, conditions, and a short forecast",
    tag: "Beginner Friendly",
  },
  {
    title: "To-Do List",
    desc: "Add, check off, and delete daily tasks",
    prompt: "Build a simple to-do list app where I can add tasks, mark them complete, and delete them",
    tag: "Beginner Friendly",
  },
  {
    title: "Recipe Finder",
    desc: "Search recipes and see ingredients and steps",
    prompt: "Build a recipe finder app where I can search for a dish and see a list of ingredients and step-by-step instructions",
    tag: "Everyday App",
  },
  {
    title: "Personal Blog",
    desc: "A homepage listing posts with a page for each one",
    prompt: "Build a simple personal blog with a homepage listing posts and a page to read each full post",
    tag: "Everyday App",
  },
];

export default function LandingScreen({
  projects,
  onSubmit,
  onOpenProject,
  onDeleteProject,
}: LandingScreenProps) {
  const [value, setValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  function submit(textOverride?: string) {
    if (submitting) return;
    const text = (textOverride !== undefined ? textOverride : value).trim();
    if (!text && attachedFiles.length === 0) return;
    setSubmitting(true);
    onSubmit(text || "Custom project with uploaded files", attachedFiles);
  }

  function handleAddFiles(newFiles: AttachedFile[]) {
    setAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const filtered = newFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...filtered];
    });
  }

  function handleRemoveFile(filename: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== filename));
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const read = await readUploadedFiles(e.dataTransfer.files);
      handleAddFiles(read);
    }
  }

  return (
    <div style={styles.container}>
      <div className="ambient-glow" />
      <div className="ambient-grid" />

      <div style={styles.content}>
        {/* Hero Section */}
        <div style={styles.heroSection}>
          <div style={styles.badgeWrapper}>
            <div style={styles.liveBadge}>
              <span style={styles.livePulse}></span>
              <span>Next-Gen In-Browser IDE & Runtime</span>
            </div>
          </div>

          <div style={styles.titleGroup}>
            <p style={styles.subheading}>
              Instant Node.js development in your browser. Real compilation, Monaco code editing, and sub-millisecond hot reloads.
            </p>
          </div>

          {/* Interactive Prompt Card */}
          <div
            style={{
              ...styles.promptCard,
              borderColor: isDragging ? "#ff4e00" : "rgba(255, 120, 50, 0.2)",
              background: isDragging ? "rgba(255, 78, 0, 0.08)" : undefined,
            }}
            className="zephyr-glass"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <textarea
              style={styles.textarea}
              placeholder="What do you want to build? (e.g., 'Full-stack REST API with tasks database and sleek dark dashboard')"
              value={value}
              disabled={submitting}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
            />

            {/* File attachment & extension controller */}
            <div style={{ marginTop: "4px" }}>
              <FileAttachmentBar
                attachedFiles={attachedFiles}
                onAddFiles={handleAddFiles}
                onRemoveFile={handleRemoveFile}
                buttonLabel="Attach Project Files"
              />
            </div>

            <div style={styles.promptToolbar}>
              <div style={styles.promptHints}>
                <span style={styles.hintKey}>↵ Enter</span>
                <span style={styles.hintText}>to launch environment</span>
                {isDragging && (
                  <span style={{ color: "#ff8438", marginLeft: "6px", fontWeight: 600 }}>
                    Drop files to attach to project
                  </span>
                )}
              </div>

              <div style={styles.toolbarRight}>
                <button
                  style={styles.launchButton}
                  onClick={() => submit()}
                  disabled={(!value.trim() && attachedFiles.length === 0) || submitting}
                  title="Launch workspace"
                >
                  <SendIcon size={13} />
                  <span>{submitting ? "Booting..." : "Launch Project"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Presets Grid */}
          <div style={styles.presetSection}>
            <div style={styles.presetHeader}>
              <SparklesIcon size={13} style={{ color: "#ff8438" }} />
              <span>Or choose a pre-configured architecture</span>
            </div>

            <div style={styles.presetGrid}>
              {STARTER_PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  style={styles.presetCard}
                  className="zephyr-card"
                  onClick={() => {
                    setValue(preset.prompt);
                    submit(preset.prompt);
                  }}
                >
                  <div style={styles.presetTopRow}>
                    <span style={styles.presetTag}>{preset.tag}</span>
                    <PlayIcon size={12} style={{ color: "rgba(255,182,119,0.7)" }} />
                  </div>
                  <div style={styles.presetTitle}>{preset.title}</div>
                  <div style={styles.presetDesc}>{preset.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Projects Section */}
        <div style={styles.projectsSection}>
          <div style={styles.projectsHeader}>
            <div style={styles.projectsHeaderLeft}>
              <TerminalIcon size={14} style={{ color: "#ff8438" }} />
              <span style={styles.projectsTitle}>Recent Projects</span>
            </div>
            {projects.length > 0 && (
              <span style={styles.projectsCount}>{projects.length} Saved</span>
            )}
          </div>

          {projects.length === 0 ? (
            <div style={styles.emptyProjectsCard} className="zephyr-card">
              <CodeIcon size={24} style={{ color: "rgba(255, 120, 50, 0.4)", marginBottom: "8px" }} />
              <p style={styles.emptyProjectsTitle}>No saved workspaces yet</p>
              <p style={styles.emptyProjectsSubtitle}>
                Type a prompt above or pick a starter template to spin up your first live project.
              </p>
            </div>
          ) : (
            <div style={styles.projectsGrid}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  style={styles.projectCard}
                  className="zephyr-card"
                  onMouseEnter={() => setHoveredProjectId(p.id)}
                  onMouseLeave={() => setHoveredProjectId(null)}
                  onClick={() => !submitting && onOpenProject(p)}
                >
                  <div style={styles.projectCardTop}>
                    <div style={styles.projectCardDot} />
                    <span style={styles.projectCardTime}>{formatRelativeTime(p.createdAt)}</span>
                  </div>

                  <div style={styles.projectCardName}>{p.name}</div>

                  <div style={styles.projectCardFooter}>
                    <span style={styles.openLabel}>
                      <ZapIcon size={12} /> Open Workspace
                    </span>
                    <button
                      style={{
                        ...styles.deleteProjectBtn,
                        opacity: hoveredProjectId === p.id ? 1 : 0.4,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(p.id);
                      }}
                      title="Delete project"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    width: "100%",
    overflowY: "auto",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "36px 20px 60px",
  },
  content: {
    position: "relative",
    zIndex: 1,
    width: "min(880px, 94vw)",
    display: "flex",
    flexDirection: "column",
    gap: "48px",
  },
  heroSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "18px",
  },
  badgeWrapper: {
    marginBottom: "4px",
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(255, 78, 0, 0.08)",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    padding: "5px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#ffb677",
    letterSpacing: "0.02em",
  },
  livePulse: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#ff4e00",
    boxShadow: "0 0 8px #ff4e00",
  },
  titleGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    maxWidth: "640px",
  },
  brandTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  brandMark: {
    color: "#ff4e00",
    fontFamily: "var(--font-mono)",
    fontSize: "clamp(28px, 4vw, 38px)",
    fontWeight: 800,
    textShadow: "0 0 20px rgba(255, 78, 0, 0.4)",
  },
  heading: {
    fontSize: "clamp(28px, 4vw, 40px)",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #ffffff 40%, #ffb677 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  subheading: {
    fontSize: "14.5px",
    lineHeight: 1.6,
    color: "rgba(255, 255, 255, 0.65)",
    margin: 0,
  },
  promptCard: {
    width: "100%",
    borderRadius: "18px",
    padding: "16px 18px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 78, 0, 0.08)",
  },
  textarea: {
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    color: "#ffffff",
    fontFamily: "var(--font-sans)",
    fontSize: "14.5px",
    lineHeight: 1.55,
    minHeight: "75px",
  },
  promptToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    paddingTop: "10px",
  },
  promptHints: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "rgba(255, 255, 255, 0.4)",
  },
  hintKey: {
    background: "rgba(255, 255, 255, 0.07)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "4px",
    padding: "1px 6px",
    fontSize: "10.5px",
    fontFamily: "var(--font-mono)",
    color: "#ffb677",
  },
  hintText: {
    fontSize: "11.5px",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  launchButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "linear-gradient(135deg, #ff4e00, #d93d00)",
    color: "#ffffff",
    border: "1px solid rgba(255, 182, 119, 0.3)",
    borderRadius: "10px",
    padding: "8px 18px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(255, 78, 0, 0.35)",
    transition: "all 0.18s ease",
  },
  presetSection: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  presetHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "12px",
    width: "100%",
  },
  presetCard: {
    padding: "14px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  presetTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2px",
  },
  presetTag: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#ff8438",
    background: "rgba(255, 78, 0, 0.1)",
    padding: "2px 6px",
    borderRadius: "4px",
    border: "1px solid rgba(255, 78, 0, 0.2)",
  },
  presetTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#ffffff",
  },
  presetDesc: {
    fontSize: "11.5px",
    color: "rgba(255, 255, 255, 0.5)",
    lineHeight: 1.4,
  },
  projectsSection: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  projectsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectsHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  projectsTitle: {
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.7)",
  },
  projectsCount: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.4)",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "2px 8px",
    borderRadius: "999px",
  },
  emptyProjectsCard: {
    padding: "32px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  emptyProjectsTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "rgba(255, 255, 255, 0.75)",
    margin: "0 0 4px 0",
  },
  emptyProjectsSubtitle: {
    fontSize: "12.5px",
    color: "rgba(255, 255, 255, 0.4)",
    margin: 0,
    maxWidth: "380px",
  },
  projectsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "12px",
  },
  projectCard: {
    padding: "14px 16px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  projectCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectCardDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#ff4e00",
    boxShadow: "0 0 6px rgba(255, 78, 0, 0.6)",
  },
  projectCardTime: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.35)",
  },
  projectCardName: {
    fontSize: "13.5px",
    fontWeight: 600,
    color: "#ffffff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectCardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "4px",
    paddingTop: "8px",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
  },
  openLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "11.5px",
    fontWeight: 600,
    color: "#ffb677",
  },
  deleteProjectBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.5)",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  },
};
