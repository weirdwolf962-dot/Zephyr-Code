import React, { useRef, useState } from "react";
import { UploadIcon, FilePlusIcon, CloseIcon, getFileIcon } from "./icons";
import {
  COMMON_EXTENSIONS,
  readUploadedFiles,
  formatFileSize,
  type AttachedFile,
} from "../utils/fileAttachment";

interface FileAttachmentBarProps {
  attachedFiles: AttachedFile[];
  onAddFiles: (files: AttachedFile[]) => void;
  onRemoveFile: (filename: string) => void;
  /** Renders a small circular icon-only trigger instead of a labeled button. */
  iconOnly?: boolean;
  buttonLabel?: string;
}

// A single, unified control for attaching real files or quickly creating a
// new templated one. Previously this was two separate buttons (Attach /
// + File Extension) each opening their own overlapping UI — now there's one
// trigger and one popover with a clear top-to-bottom flow.
export function FileAttachmentBar({
  attachedFiles,
  onAddFiles,
  onRemoveFile,
  iconOnly = false,
  buttonLabel = "Attach or Create File",
}: FileAttachmentBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [customName, setCustomName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    const read = await readUploadedFiles(e.target.files);
    onAddFiles(read);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowMenu(false);
  }

  function handleAddTemplateFile(extObj: (typeof COMMON_EXTENSIONS)[0]) {
    const raw = customName.trim();
    let fileName = raw || `untitled_${Date.now().toString(36).slice(-4)}`;
    fileName = fileName.replace(/\.[a-zA-Z0-9]+$/, "") + extObj.ext;
    onAddFiles([
      { name: fileName, extension: extObj.ext, size: extObj.template.length, contents: extObj.template },
    ]);
    setCustomName("");
    setShowMenu(false);
  }

  return (
    <div style={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      <button
        type="button"
        style={{
          ...(iconOnly ? styles.iconTrigger : styles.trigger),
          background: showMenu ? "rgba(255, 78, 0, 0.18)" : iconOnly ? "rgba(255,255,255,0.05)" : "rgba(255, 78, 0, 0.08)",
          borderColor: showMenu ? "#ff4e00" : "rgba(255, 120, 50, 0.25)",
        }}
        onClick={() => setShowMenu((v) => !v)}
        title="Attach a file or create a new one"
      >
        <FilePlusIcon size={iconOnly ? 15 : 13} />
        {!iconOnly && <span>{buttonLabel}</span>}
      </button>

      {showMenu && (
        <div style={styles.popover} className="zephyr-card">
          <div style={styles.popoverHeader}>
            <span style={styles.popoverTitle}>Add a File</span>
            <button style={styles.popoverCloseBtn} onClick={() => setShowMenu(false)}>
              <CloseIcon size={12} />
            </button>
          </div>

          <button type="button" style={styles.uploadRow} onClick={() => fileInputRef.current?.click()}>
            <UploadIcon size={13} />
            <span>Upload from your computer</span>
          </button>

          <div style={styles.divider}>or create a new file</div>

          <input
            type="text"
            placeholder="Optional file name…"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            style={styles.nameInput}
          />

          <div style={styles.extGrid}>
            {COMMON_EXTENSIONS.map((item) => (
              <button
                key={item.ext}
                type="button"
                style={styles.extChip}
                onClick={() => handleAddTemplateFile(item)}
                title={`Add a ${item.label} file`}
              >
                <span style={{ color: item.color, fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {item.ext}
                </span>
                <span style={styles.extLabel}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div style={styles.attachedBadgesList}>
          {attachedFiles.map((file) => (
            <div key={file.name} style={styles.fileBadge}>
              <div style={styles.fileBadgeLeft}>
                {getFileIcon(file.name, 13)}
                <span style={styles.fileNameText}>{file.name}</span>
                <span style={styles.fileSizeText}>({formatFileSize(file.size)})</span>
              </div>
              <button
                type="button"
                style={styles.removeBadgeBtn}
                onClick={() => onRemoveFile(file.name)}
                title="Remove attached file"
              >
                <CloseIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    position: "relative",
  },
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    color: "#ffb677",
    padding: "5px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    alignSelf: "flex-start",
  },
  iconTrigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#ffb677",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  popover: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: "0",
    width: "280px",
    maxWidth: "90vw",
    background: "#120904",
    border: "1px solid rgba(255, 120, 50, 0.3)",
    borderRadius: "14px",
    padding: "14px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255,78,0,0.15)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  popoverHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  popoverTitle: {
    fontSize: "12.5px",
    fontWeight: 700,
    color: "#ffffff",
  },
  popoverCloseBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.4)",
    cursor: "pointer",
    padding: "2px",
    display: "flex",
    alignItems: "center",
  },
  uploadRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "8px 10px",
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  },
  divider: {
    fontSize: "10px",
    color: "rgba(255, 255, 255, 0.35)",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  nameInput: {
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    borderRadius: "8px",
    padding: "7px 10px",
    fontSize: "12px",
    color: "#fff",
    outline: "none",
    fontFamily: "var(--font-mono)",
    width: "100%",
  },
  extGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "6px",
  },
  extChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 4px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    background: "rgba(255, 255, 255, 0.02)",
    cursor: "pointer",
    gap: "3px",
    transition: "all 0.15s ease",
  },
  extLabel: {
    fontSize: "9px",
    color: "rgba(255, 255, 255, 0.5)",
    whiteSpace: "nowrap",
  },
  attachedBadgesList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  fileBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255, 78, 0, 0.12)",
    border: "1px solid rgba(255, 78, 0, 0.3)",
    borderRadius: "6px",
    padding: "3px 8px",
    fontSize: "11.5px",
  },
  fileBadgeLeft: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
  fileNameText: {
    color: "#ffb677",
    fontWeight: 500,
    fontFamily: "var(--font-mono)",
  },
  fileSizeText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: "10px",
  },
  removeBadgeBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255, 255, 255, 0.4)",
    cursor: "pointer",
    padding: "2px",
    display: "flex",
    alignItems: "center",
    marginLeft: "2px",
  },
};
