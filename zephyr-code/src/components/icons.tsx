import React from "react";
import {
  Download,
  Trash2,
  Save,
  Home,
  Play,
  Terminal,
  Code2,
  Eye,
  Columns,
  RotateCw,
  ExternalLink,
  Plus,
  FileCode,
  FileText,
  FileJson,
  Check,
  Copy,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Smartphone,
  Tablet,
  Monitor,
  Search,
  Send,
  Zap,
  Upload,
  FilePlus,
  Database,
  Image as ImageIcon,
  Mic,
  ChevronRight,
  Folder,
  ClipboardEdit,
  Wrench,
  Pencil,
} from "lucide-react";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const UploadIcon = ({ size = 14, className, style }: IconProps) => (
  <Upload size={size} className={className} style={style} />
);

export const FilePlusIcon = ({ size = 14, className, style }: IconProps) => (
  <FilePlus size={size} className={className} style={style} />
);

export const DownloadIcon = ({ size = 16, className, style }: IconProps) => (
  <Download size={size} className={className} style={style} />
);

export const TrashIcon = ({ size = 14, className, style }: IconProps) => (
  <Trash2 size={size} className={className} style={style} />
);

export const SaveIcon = ({ size = 14, className, style }: IconProps) => (
  <Save size={size} className={className} style={style} />
);

export const HomeIcon = ({ size = 16, className, style }: IconProps) => (
  <Home size={size} className={className} style={style} />
);

export const PlayIcon = ({ size = 14, className, style }: IconProps) => (
  <Play size={size} className={className} style={style} />
);

export const TerminalIcon = ({ size = 14, className, style }: IconProps) => (
  <Terminal size={size} className={className} style={style} />
);

export const CodeIcon = ({ size = 14, className, style }: IconProps) => (
  <Code2 size={size} className={className} style={style} />
);

export const PreviewIcon = ({ size = 14, className, style }: IconProps) => (
  <Eye size={size} className={className} style={style} />
);

export const SplitIcon = ({ size = 14, className, style }: IconProps) => (
  <Columns size={size} className={className} style={style} />
);

export const RefreshIcon = ({ size = 14, className, style }: IconProps) => (
  <RotateCw size={size} className={className} style={style} />
);

export const ExternalLinkIcon = ({ size = 14, className, style }: IconProps) => (
  <ExternalLink size={size} className={className} style={style} />
);

export const PlusIcon = ({ size = 14, className, style }: IconProps) => (
  <Plus size={size} className={className} style={style} />
);

export const CloseIcon = ({ size = 14, className, style }: IconProps) => (
  <X size={size} className={className} style={style} />
);

export const CopyIcon = ({ size = 14, className, style }: IconProps) => (
  <Copy size={size} className={className} style={style} />
);

export const CheckIcon = ({ size = 14, className, style }: IconProps) => (
  <Check size={size} className={className} style={style} />
);

export const BrandLogo = ({ size = 20, className, style }: IconProps) => {
  const [hasError, setHasError] = React.useState(false);
  if (hasError) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontWeight: 800,
          color: "#ff4e00",
          fontSize: `${size}px`,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          textShadow: "0 0 14px rgba(255, 78, 0, 0.4)",
          ...style,
        }}
        className={className}
      >
        ⟨/⟩
      </span>
    );
  }
  return (
    <img
      src="/logo.png"
      alt="Logo"
      width={size}
      height={size}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        borderRadius: "4px",
        flexShrink: 0,
        ...style,
      }}
      className={className}
    />
  );
};

export const SparklesIcon = ({ size = 14, className, style }: IconProps) => {
  const [hasError, setHasError] = React.useState(false);
  if (hasError) {
    return <Sparkles size={size} className={className} style={style} />;
  }
  return (
    <img
      src="/sparkle.png"
      alt="Sparkle"
      width={size}
      height={size}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      className={className}
    />
  );
};

export const ChevronDownIcon = ({ size = 14, className, style }: IconProps) => (
  <ChevronDown size={size} className={className} style={style} />
);

export const ChevronUpIcon = ({ size = 14, className, style }: IconProps) => (
  <ChevronUp size={size} className={className} style={style} />
);

export const MobileIcon = ({ size = 14, className, style }: IconProps) => (
  <Smartphone size={size} className={className} style={style} />
);

export const TabletIcon = ({ size = 14, className, style }: IconProps) => (
  <Tablet size={size} className={className} style={style} />
);

export const DesktopIcon = ({ size = 14, className, style }: IconProps) => (
  <Monitor size={size} className={className} style={style} />
);

export const SearchIcon = ({ size = 14, className, style }: IconProps) => (
  <Search size={size} className={className} style={style} />
);

export const SendIcon = ({ size = 14, className, style }: IconProps) => (
  <Send size={size} className={className} style={style} />
);

export const ZapIcon = ({ size = 14, className, style }: IconProps) => (
  <Zap size={size} className={className} style={style} />
);

export const MicIcon = ({ size = 14, className, style }: IconProps) => (
  <Mic size={size} className={className} style={style} />
);

export const ChevronRightIcon = ({ size = 14, className, style }: IconProps) => (
  <ChevronRight size={size} className={className} style={style} />
);

export const FolderClosedIcon = ({ size = 14, className, style }: IconProps) => (
  <Folder size={size} className={className} style={style} />
);

export const ActionHistoryIcon = ({ size = 14, className, style }: IconProps) => (
  <ClipboardEdit size={size} className={className} style={style} />
);

export const BuiltIcon = ({ size = 14, className, style }: IconProps) => (
  <Wrench size={size} className={className} style={style} />
);

export const EditPencilIcon = ({ size = 14, className, style }: IconProps) => (
  <Pencil size={size} className={className} style={style} />
);

export function getFileIcon(filename: string, size = 13) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "json":
      return <FileJson size={size} color="#f59e0b" />;
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return <FileCode size={size} color="#facc15" />;
    case "ts":
    case "tsx":
      return <FileCode size={size} color="#38bdf8" />;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <FileCode size={size} color="#60a5fa" />;
    case "html":
    case "htm":
      return <FileCode size={size} color="#ff8438" />;
    case "md":
    case "markdown":
    case "txt":
      return <FileText size={size} color="#a78bfa" />;
    case "sql":
    case "sqlite":
    case "db":
      return <Database size={size} color="#34d399" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <ImageIcon size={size} color="#f472b6" />;
    case "env":
      return <FileCode size={size} color="#fbbf24" />;
    default:
      return <FileText size={size} color="rgba(255,255,255,0.45)" />;
  }
}
