import JSZip from "jszip";
import type { WebContainer } from "@webcontainer/api";
import { virtualEnv, getIsVirtual } from "./webcontainerBoot";

export interface FlatFile {
  path: string;
  contents: string;
}

// Reads every file out of the container or virtual environment recursively.
export async function readAllFiles(container: WebContainer | null, dir = "."): Promise<FlatFile[]> {
  if (getIsVirtual() || !container) {
    return virtualEnv.getFlatFiles();
  }

  try {
    const entries = await container.fs.readdir(dir, { withFileTypes: true });
    const files: FlatFile[] = [];

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const entryPath = dir === "." ? entry.name : `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        files.push(...(await readAllFiles(container, entryPath)));
      } else {
        const contents = await container.fs.readFile(entryPath, "utf-8");
        files.push({ path: entryPath, contents });
      }
    }

    if (files.length === 0) {
      return virtualEnv.getFlatFiles();
    }
    return files;
  } catch (err) {
    console.warn("Could not read real container fs, using virtual fallback:", err);
    return virtualEnv.getFlatFiles();
  }
}

export async function downloadAsZip(files: FlatFile[], zipName = "zephyr-code-project.zip") {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.contents);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
