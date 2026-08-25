import { useState } from "react";
import type { Project } from "../utils/projects";
import { formatRelativeTime } from "../utils/projects";

interface LandingScreenProps {
  projects: Project[];
  onSubmit: (prompt: string) => void;
  onDeleteProject: (id: string) => void;
}

export default function LandingScreen({ projects, onSubmit, onDeleteProject }: LandingScreenProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (submitting) return; // blocks a second Enter/click before the screen changes
    const text = value.trim();
    if (!text) return;
    setSubmitting(true);
    onSubmit(text);
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.logoRow}>
          <span style={styles.logoMark}>⟨/⟩</span>
        </div>
        <h1 style={styles.heading}>Build your ideas with Zephyr</h1>
        <p style={styles.subheading}>Describe an app and let Zephyr do the rest</p>

        <div style={styles.inputBox}>
          <textarea
            style={styles.textarea}
            placeholder="Describe an app and let Zephyr do the rest…"
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
          <div style={styles.inputToolbar}>
            <div style={styles.inputIcons}>
              <span style={styles.iconButton} title="Voice (not wired yet)">🎤</span>
              <span style={styles.iconButton} title="Attach (not wired yet)">＋</span>
            </div>
            <button style={styles.sendButton} onClick={submit} disabled={!value.trim() || submitting}>
              ↑
            </button>
          </div>
        </div>
      </div>

      <div style={styles.projectsSection}>
        <p style={styles.projectsLabel}>Recent projects</p>
        {projects.length === 0 ? (
          <p style={styles.projectsEmpty}>No projects yet — describe something above to get started.</p>
        ) : (
          <div style={styles.projectsList}>
            {projects.map((p) => (
              <div key={p.id} style={styles.projectRow}>
                <span style={styles.projectDot} />
                <span style={styles.projectName}>{p.name}</span>
                <span style={styles.projectTime}>{formatRelativeTime(p.createdAt)}</span>
                <button
                  style={styles.deleteButton}
                  onClick={() => onDeleteProject(p.id)}
                  title="Delete project"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    gap: "56px",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    width: "min(640px, 92vw)",
  },
  logoRow: { marginBottom: "6px" },
  logoMark: {
    color: "#ff4e00",
    fontFamily: "var(--font-mono)",
    fontSize: "26px",
    fontWeight: 700,
  },
  heading: {
    fontFamily: "var(--font-sans)",
    fontSize: "clamp(24px, 4vw, 34px)",
    fontWeight: 600,
    color: "#fff",
    textAlign: "center",
    margin: 0,
  },
  subheading: {
    fontFamily: "var(--font-serif)",
    fontStyle: "italic",
    fontSize: "16px",
    color: "rgba(255,255,255,0.4)",
    margin: 0,
    marginBottom: "8px",
  },
  inputBox: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "18px",
    padding: "14px 16px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  textarea: {
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    color: "#fff",
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  inputToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inputIcons: { display: "flex", gap: "10px" },
  iconButton: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    cursor: "default",
  },
  sendButton: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "#ff4e00",
    color: "#0a0502",
    border: "none",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  projectsSection: {
    width: "min(640px, 92vw)",
  },
  projectsLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    marginBottom: "10px",
  },
  projectsEmpty: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.25)",
  },
  projectsList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  projectRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 12px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  projectDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#ff4e00",
    flexShrink: 0,
  },
  projectName: {
    flex: 1,
    fontSize: "13px",
    color: "rgba(255,255,255,0.8)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectTime: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.3)",
    flexShrink: 0,
  },
  deleteButton: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.25)",
    fontSize: "12px",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: "6px",
  },
};
