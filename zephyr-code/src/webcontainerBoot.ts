import { WebContainer } from "@webcontainer/api";
import type { FileSystemTree } from "@webcontainer/api";

// ── Hardcoded hello-world project ───────────────────────────────────────────
// A plain Node http server — no framework, no build step — so this test
// proves WebContainers itself works before anything AI-generated touches it.
const helloWorldFiles: FileSystemTree = {
  "package.json": {
    file: {
      contents: JSON.stringify(
        {
          name: "zephyr-code-hello-world",
          type: "module",
          scripts: { dev: "node --watch server.js" },
        },
        null,
        2
      ),
    },
  },
  "server.js": {
    file: {
      contents: `import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(\`<!doctype html>
<html>
  <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0a0502;color:#ffb677;font-family:system-ui,sans-serif;text-align:center;padding:2rem;">
    <div>
      <h1 style="color:#ff4e00;margin-bottom:0.5rem;">Hello from inside WebContainers</h1>
      <p style="color:#ffb677a0;">Real Node.js, running entirely in your browser tab.</p>
    </div>
  </body>
</html>\`);
});

const port = process.env.PORT || 3111;
server.listen(port, () => {
  console.log('Server running on port ' + port);
});
`,
    },
  },
};

export type BootStage =
  | "idle"
  | "booting"
  | "mounting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface BootCallbacks {
  onLog: (line: string) => void;
  onStageChange: (stage: BootStage) => void;
  onPreviewReady: (url: string) => void;
}

let container: WebContainer | null = null;
let containerPromise: Promise<WebContainer> | null = null;
let unsubscribeServerReady: (() => void) | null = null;

export function getContainer(): WebContainer | null {
  return container;
}

// Writes one file into the live container. This is the loop a human
// (and later, the AI) uses to make a change: write -> node --watch
// notices the file changed -> restarts the server -> "server-ready"
// fires again -> the preview iframe refreshes automatically.
export async function writeFile(path: string, contents: string): Promise<void> {
  if (!container) throw new Error("WebContainer isn't booted yet.");
  await container.fs.writeFile(path, contents);
}

// Single-flight guard: WebContainer only allows ONE instance per page.
// If two callers race to boot before the first resolves, calling
// WebContainer.boot() twice deadlocks the whole runtime. Caching the
// PROMISE (not just the resolved container) means a second concurrent
// call just awaits the same in-flight boot instead of starting another.
function getOrBootContainer(): Promise<WebContainer> {
  if (!containerPromise) {
    containerPromise = WebContainer.boot().catch((err) => {
      containerPromise = null; // let the next attempt try again
      throw err;
    });
  }
  return containerPromise;
}

export async function bootHelloWorld({ onLog, onStageChange, onPreviewReady }: BootCallbacks) {
  if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
    onStageChange("error");
    onLog("❌ Not cross-origin isolated. COOP/COEP headers are missing on this page.");
    onLog("   Local dev: check vite.config.ts. Deployed: check vercel.json.");
    return;
  }

  try {
    onStageChange("booting");
    onLog("Booting WebContainer runtime…");
    container = await getOrBootContainer();
    onLog("✅ WebContainer booted.");

    onStageChange("mounting");
    onLog("Mounting hello-world file tree…");
    await container.mount(helloWorldFiles);
    onLog("✅ Files mounted (package.json, server.js).");

    onStageChange("installing");
    onLog("Running npm install…");
    const install = await container.spawn("npm", ["install"]);
    install.output.pipeTo(
      new WritableStream({
        write: (data) => onLog(data.toString().trimEnd()),
      })
    );
    const installExit = await install.exit;
    if (installExit !== 0) {
      onStageChange("error");
      onLog(`❌ npm install failed (exit code ${installExit}).`);
      return;
    }
    onLog("✅ npm install complete.");

    // server-ready fires on first boot AND every time --watch restarts the
    // server after a save — that repeat firing is exactly what drives the
    // preview auto-refresh. Only one listener should ever be active at once.
    unsubscribeServerReady?.();
    unsubscribeServerReady = container.on("server-ready", (_port, url) => {
      onStageChange("ready");
      onLog(`✅ Server ready at ${url}`);
      onPreviewReady(url);
    });

    onStageChange("starting");
    onLog("Running npm run dev…");
    const dev = await container.spawn("npm", ["run", "dev"]);
    dev.output.pipeTo(
      new WritableStream({
        write: (data) => onLog(data.toString().trimEnd()),
      })
    );
  } catch (err) {
    onStageChange("error");
    onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
  }
}
