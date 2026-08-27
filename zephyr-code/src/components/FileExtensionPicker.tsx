import React, { useRef, useState } from "react";
import {
  PaperclipIcon,
  UploadIcon,
  FilePlusIcon,
  CloseIcon,
  getFileIcon,
  CheckIcon,
} from "./icons";
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
  compact?: boolean;
  buttonLabel?: string;
}

export function FileAttachmentBar({
  attachedFiles,
  onAddFiles,
  onRemoveFile,
  compact = false,
  buttonLabel = "Attach File",
}: FileAttachmentBarProps) {
  const [showExtensionMenu, setShowExtensionMenu] = useState(false);
  const [customName, setCustomName] = useState("");
  const [selectedExt, setSelectedExt] = useState(".js");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    const read = await readUploadedFiles(e.target.files);
    onAddFiles(read);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleAddTemplateFile(extObj: typeof COMMON_EXTENSIONS[0]) {
    const defaultName = `new_file_${Date.now().toString(36).slice(-4)}${extObj.ext}`;
    onAddFiles([
      {
        name: defaultName,
        extension: extObj.ext,
        size: extObj.template.length,
        contents: extObj.template,
      },
    ]);
    setShowExtensionMenu(false);
  }

  function handleAddCustomNamedFile() {
    const raw = customName.trim();
    if (!raw) return;
    let fileName = raw;
    if (!fileName.includes(".")) {
      fileName += selectedExt;
    }
    const extMatch = COMMON_EXTENSIONS.find((e) => fileName.endsWith(e.ext)) || {
      ext: selectedExt,
      template: `// ${fileName}\n`,
    };

    onAddFiles([
      {
        name: fileName,
        extension: extMatch.ext,
        size: extMatch.template.length,
        contents: extMatch.template,
      },
    ]);
    setCustomName("");
    setShowExtensionMenu(false);
  }

  return (
    <div style={styles.container}>
      {/* Hidden native file picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {/* Action Trigger Buttons */}
      <div style={styles.actionsRow}>
        <button
          type="button"
          style={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          title="Upload files from your computer (.js, .ts, .json, .html, .css, .sql, .md, etc.)"
        >
          <PaperclipIcon size={compact ? 12 : 13} />
          <span>{buttonLabel}</span>
        </button>

        <button
          type="button"
          style={{
            ...styles.templateBtn,
            background: showExtensionMenu ? "rgba(255, 78, 0, 0.2)" : "rgba(255, 255, 255, 0.04)",
            borderColor: showExtensionMenu ? "#ff4e00" : "rgba(255, 120, 50, 0.2)",
          }}
          onClick={() => setShowExtensionMenu((prev) => !prev)}
          title="Add files by file extension (.ts, .sql, .json, .css, etc.)"
        >
          <FilePlusIcon size={compact ? 12 : 13} />
          <span>+ File Extension</span>
        </button>
      </div>

      {/* Extension Selection Dropdown / Popover */}
      {showExtensionMenu && (
        <div style={styles.extensionPopover} className="zephyr-card">
          <div style={styles.popoverHeader}>
            <div style={styles.popoverTitle}>Add Project File by Extension</div>
            <button
              style={styles.popoverCloseBtn}
              onClick={() => setShowExtensionMenu(false)}
            >
              <CloseIcon size={12} />
            </button>
          </div>

          <div style={styles.quickExtensionsGrid}>
            {COMMON_EXTENSIONS.map((item) => (
              <button
                key={item.ext}
                type="button"
                style={{
                  ...styles.extensionChip,
                  borderColor: selectedExt === item.ext ? item.color : "rgba(255, 255, 255, 0.08)",
                  background: selectedExt === item.ext ? "rgba(255, 78, 0, 0.15)" : "rgba(255, 255, 255, 0.02)",
                }}
                onClick={() => setSelectedExt(item.ext)}
              >
                <span style={{ color: item.color, fontWeight: 700, fontFamily: "monospace" }}>
                  {item.ext}
                </span>
                <span style={styles.extensionLabel}>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Named File Creation Input */}
          <div style={styles.customFileRow}>
            <input
              type="text"
              placeholder={`e.g. database_schema${selectedExt}`}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomNamedFile();
                }
              }}
              style={styles.customFileInput}
              autoFocus
            />
            <button
              type="button"
              style={styles.addCustomBtn}
              onClick={handleAddCustomNamedFile}
              disabled={!customName.trim()}
            >
              Add {selectedExt}
            </button>
          </div>

          <div style={styles.popoverOrDivider}>or quick-add template</div>

          <div style={styles.templatePillList}>
            {COMMON_EXTENSIONS.map((item) => (
              <button
                key={item.ext}
                type="button"
                style={styles.quickTemplatePill}
                onClick={() => handleAddTemplateFile(item)}
              >
                <span style={{ color: item.color, fontWeight: 700 }}>+</span>
                <span>starter{item.ext}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attached Files Badge List */}
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
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  attachBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    background: "rgba(255, 78, 0, 0.08)",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    color: "#ffb677",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  templateBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    border: "1px solid rgba(255, 120, 50, 0.2)",
    color: "rgba(255, 255, 255, 0.8)",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  extensionPopover: {
    position: "absolute",
    bottom: "100%",
    left: "0",
    marginBottom: "8px",
    width: "360px",
    maxWidth: "95vw",
    background: "#120904",
    border: "1px solid rgba(255, 120, 50, 0.3)",
    borderRadius: "12px",
    padding: "14px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255,78,0,0.15)",
    zIndex: 100,
  },
  popoverHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  popoverTitle: {
    fontSize: "12.5px",
    fontWeight: 600,
    color: "#ffb677",
    letterSpacing: "-0.01em",
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
  quickExtensionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "6px",
    marginBottom: "12px",
  },
  extensionChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 4px",
    borderRadius: "6px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    cursor: "pointer",
    fontSize: "11px",
    gap: "2px",
    transition: "all 0.15s ease",
  },
  extensionLabel: {
    fontSize: "9.5px",
    color: "rgba(255, 255, 255, 0.5)",
    whiteSpace: "nowrap",
  },
  customFileRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "10px",
  },
  customFileInput: {
    flex: 1,
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 120, 50, 0.25)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#fff",
    outline: "none",
    fontFamily: "monospace",
  },
  addCustomBtn: {
    background: "linear-gradient(135deg, #ff4e00, #ff8438)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "11.5px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  popoverOrDivider: {
    fontSize: "10.5px",
    color: "rgba(255, 255, 255, 0.35)",
    textAlign: "center",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  templatePillList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  quickTemplatePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "rgba(255, 255, 255, 0.75)",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "monospace",
    cursor: "pointer",
    transition: "all 0.12s ease",
  },
  attachedBadgesList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "2px",
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
    fontFamily: "monospace",
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
