import JSZip from "jszip";
import type { WebContainer } from "@webcontainer/api";

export interface FlatFile {
  path: string;
  contents: string;
}

// Reads every file out of the booted container, recursively. Skips
// node_modules — it's huge and never something a user wants zipped up.
export async function readAllFiles(container: WebContainer, dir = "."): Promise<FlatFile[]> {
  const entries = await container.fs.readdir(dir, { withFileTypes: true });
  const files: FlatFile[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const entryPath = dir === "." ? entry.name : `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await readAllFiles(container, entryPath)));
    } else {
      const contents = await container.fs.readFile(entryPath, "utf-8");
      files.push({ path: entryPath, contents });
    }
  }

  return files;
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
  URL.revokeObjectURL(url);
}
