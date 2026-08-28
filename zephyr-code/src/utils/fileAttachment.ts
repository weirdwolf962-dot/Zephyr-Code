export interface AttachedFile {
  name: string;
  extension: string;
  size: number;
  contents: string;
  isBinary?: boolean;
}

export const COMMON_EXTENSIONS = [
  { ext: ".js", label: "JavaScript", color: "#facc15", template: '// JavaScript Module\nexport default function module() {\n  console.log("Module initialized");\n}\n' },
  { ext: ".ts", label: "TypeScript", color: "#38bdf8", template: '// TypeScript Interfaces & Types\nexport interface AppConfig {\n  version: string;\n  debug: boolean;\n}\n' },
  { ext: ".json", label: "JSON Data", color: "#f59e0b", template: '{\n  "name": "project-data",\n  "version": "1.0.0",\n  "items": []\n}\n' },
  { ext: ".html", label: "HTML View", color: "#ff8438", template: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Component</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>\n' },
  { ext: ".css", label: "CSS Styles", color: "#60a5fa", template: '/* Project Styles */\n:root {\n  --accent: #ff4e00;\n}\n\nbody {\n  margin: 0;\n  font-family: sans-serif;\n}\n' },
  { ext: ".md", label: "Markdown", color: "#a78bfa", template: '# Project Documentation\n\n## Overview\nDocumentation for project modules and endpoints.\n' },
  { ext: ".sql", label: "SQL Schema", color: "#34d399", template: '-- SQL Database Schema\nCREATE TABLE IF NOT EXISTS items (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n' },
  { ext: ".env", label: "Environment", color: "#fbbf24", template: '# Environment Configuration\nPORT=3000\nNODE_ENV=development\nAPI_SECRET=zephyr_dev_secret\n' },
];

export function getExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length > 1) {
    return "." + parts.pop()?.toLowerCase();
  }
  return "";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readUploadedFiles(fileList: FileList | File[]): Promise<AttachedFile[]> {
  const files = Array.from(fileList);
  const results: AttachedFile[] = [];

  for (const file of files) {
    const ext = getExtension(file.name);
    try {
      const text = await readFileAsText(file);
      results.push({
        name: file.name,
        extension: ext,
        size: file.size,
        contents: text,
      });
    } catch (err) {
      console.warn("Failed to read file as text, trying fallback", err);
    }
  }

  return results;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve((reader.result as string) || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
