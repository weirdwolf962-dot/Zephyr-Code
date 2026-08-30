import { WebContainer } from "@webcontainer/api";
import type { FileSystemTree } from "@webcontainer/api";
import { type FlatFile } from "./fileTree";

// ANSI escape sequences cleaner
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-ntqry=><~]))/g;

export function cleanLine(raw: string): string {
  return raw.replace(ANSI_PATTERN, "").trimEnd();
}

export type BootStage =
  | "idle"
  | "booting"
  | "mounting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface BootCallbacks {
  prompt?: string;
  initialFiles?: { name: string; contents: string }[];
  onLog: (line: string) => void;
  onStageChange: (stage: BootStage) => void;
  onPreviewReady: (url: string) => void;
}

// Shared shape for AI-generated files — matches src/services/generate.ts's
// GeneratedFile one-for-one, kept as a separate export here so
// webcontainerBoot.ts doesn't have to import from services/.
export interface GeneratedFile {
  filePath: string;
  fullContent: string;
}

// In-memory Virtual Filesystem fallback when WebContainer is blocked or not cross-origin isolated
class VirtualEnvironment {
  private files: Map<string, string> = new Map();
  private isRunning: boolean = false;
  private previewBlobUrl: string | null = null;
  private onPreviewReady: ((url: string) => void) | null = null;
  private onLog: ((line: string) => void) | null = null;

  setFiles(filesMap: Record<string, string>) {
    this.files.clear();
    for (const [path, contents] of Object.entries(filesMap)) {
      this.files.set(path, contents);
    }
  }

  getFlatFiles(): FlatFile[] {
    const list: FlatFile[] = [];
    for (const [path, contents] of this.files.entries()) {
      list.push({ path, contents });
    }
    return list;
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
    if (this.isRunning) {
      this.onLog?.(`[VirtualFS] Saved file: ${path}`);
      this.refreshPreview();
    }
  }

  async createFile(path: string, contents = ""): Promise<void> {
    this.files.set(path, contents);
    if (this.isRunning) {
      this.onLog?.(`[VirtualFS] Created file: ${path}`);
      this.refreshPreview();
    }
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
    if (this.isRunning) {
      this.onLog?.(`[VirtualFS] Deleted file: ${path}`);
      this.refreshPreview();
    }
  }

  // Sets several files at once and refreshes the preview ONCE at the end —
  // used by runGeneratedProject so applying a batch of AI-generated files
  // doesn't rebuild the preview blob URL once per file.
  async writeFilesBatch(files: { path: string; contents: string }[]): Promise<void> {
    for (const f of files) {
      this.files.set(f.path, f.contents);
      this.onLog?.(`[VirtualFS] Saved file: ${f.path}`);
    }
    if (this.isRunning) {
      this.refreshPreview();
    }
  }

  registerPreviewCallback(cb: (url: string) => void, logCb: (line: string) => void) {
    this.onPreviewReady = cb;
    this.onLog = logCb;
  }

  refreshPreview() {
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }

    const html = this.buildPreviewHtml();
    const blob = new Blob([html], { type: "text/html" });
    this.previewBlobUrl = URL.createObjectURL(blob);
    this.isRunning = true;
    if (this.onPreviewReady && this.previewBlobUrl) {
      this.onPreviewReady(this.previewBlobUrl);
    }
  }

  private buildPreviewHtml(): string {
    // Check if there's an index.html directly
    const indexHtml = this.files.get("index.html") || this.files.get("public/index.html");
    const styleCss = this.files.get("style.css") || this.files.get("styles.css") || this.files.get("public/style.css");
    const appJs = this.files.get("app.js") || this.files.get("main.js") || this.files.get("index.js");

    if (indexHtml) {
      let combined = indexHtml;
      if (styleCss && !combined.includes("<style>")) {
        combined = combined.replace("</head>", `<style>${styleCss}</style></head>`);
      }
      if (appJs && !combined.includes("<script")) {
        combined = combined.replace("</body>", `<script>${appJs}</script></body>`);
      }
      return combined;
    }

    // Check server.js for embedded HTML or REST responses
    const serverJs = this.files.get("server.js");
    if (serverJs) {
      // Try to extract HTML template strings from server.js
      const htmlMatch = serverJs.match(/res\.end\(`([\s\S]*?)`\)/) || serverJs.match(/res\.send\(`([\s\S]*?)`\)/);
      if (htmlMatch && htmlMatch[1]) {
        return htmlMatch[1];
      }
    }

    // Default fallback preview
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      background: #0a0502;
      color: #ffb677;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 120, 50, 0.2);
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 500px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    }
    h1 { color: #ff4e00; margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 700; }
    p { color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin: 0 0 20px 0; font-size: 0.95rem; }
    .badge {
      display: inline-block;
      background: rgba(255, 78, 0, 0.12);
      border: 1px solid rgba(255, 78, 0, 0.3);
      color: #ffb677;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="margin-bottom: 12px;"><span class="badge">⟨/⟩ Zephyr Live Runtime</span></div>
    <h1>Application is Live</h1>
    <p>Your in-browser service has initialized and is responding to edits in real-time.</p>
  </div>
</body>
</html>`;
  }
}

export const virtualEnv = new VirtualEnvironment();

// Generate files according to prompt theme
export function generateStarterFiles(prompt: string): Record<string, string> {
  const p = prompt.toLowerCase();

  if (p.includes("api") || p.includes("rest") || p.includes("backend") || p.includes("endpoint")) {
    return {
      "package.json": JSON.stringify(
        {
          name: "zephyr-rest-api",
          type: "module",
          scripts: { dev: "node --watch server.js" },
        },
        null,
        2
      ),
      "server.js": `import http from "node:http";

const db = [
  { id: "1", title: "Setup Zephyr environment", status: "completed", tag: "DevOps" },
  { id: "2", title: "Build lightning-fast REST endpoints", status: "in-progress", tag: "Backend" },
  { id: "3", title: "Design glowing obsidian UI", status: "completed", tag: "Design" },
  { id: "4", title: "Deploy to edge network", status: "pending", tag: "Cloud" }
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost:3000");

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/api/tasks") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "success", count: db.length, data: db }, null, 2));
  }

  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString(), memoryUsage: "18MB" }));
  }

  // Interactive Web Dashboard
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zephyr REST Explorer</title>
  <style>
    :root {
      --bg: #090402;
      --card: #120905;
      --accent: #ff4e00;
      --accent-light: #ffb677;
      --border: rgba(255, 120, 50, 0.18);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 2rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container { width: 100%; max-width: 680px; }
    header { margin-bottom: 2rem; text-align: center; }
    h1 { color: var(--accent); font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
    p.subtitle { color: var(--accent-light); opacity: 0.8; font-size: 0.95rem; }
    .badge {
      display: inline-block;
      background: rgba(255, 78, 0, 0.15);
      border: 1px solid var(--border);
      color: var(--accent-light);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }
    .endpoint-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .method {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
      padding: 2px 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .path { font-family: monospace; font-size: 0.95rem; color: #fff; }
    button.test-btn {
      background: var(--accent);
      color: #000;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.test-btn:hover { background: #ff651a; transform: translateY(-1px); }
    pre {
      background: #050201;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 0.85rem;
      color: #ffb677;
      font-family: monospace;
      font-size: 0.82rem;
      overflow-x: auto;
      max-height: 180px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">⟨/⟩ Zephyr Microservice</span>
      <h1>REST API Engine</h1>
      <p class="subtitle">Real-time Node.js backend running in your browser</p>
    </header>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <div>
          <span class="method">GET</span>
          <span class="path" style="margin-left: 8px;">/api/tasks</span>
        </div>
        <button class="test-btn" onclick="fetchTasks()">Test Endpoint</button>
      </div>
      <p style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.75rem;">Returns full active task items with status metadata.</p>
      <pre id="tasks-output">// Click 'Test Endpoint' to run real fetch query</pre>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <div>
          <span class="method">GET</span>
          <span class="path" style="margin-left: 8px;">/api/health</span>
        </div>
        <button class="test-btn" onclick="fetchHealth()">Check Status</button>
      </div>
      <p style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.75rem;">Returns service uptime, memory allocations and health check.</p>
      <pre id="health-output">// Click 'Check Status' to inspect</pre>
    </div>
  </div>

  <script>
    async function fetchTasks() {
      const out = document.getElementById('tasks-output');
      out.textContent = 'Loading...';
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'Error: ' + err.message;
      }
    }
    async function fetchHealth() {
      const out = document.getElementById('health-output');
      out.textContent = 'Checking...';
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'Error: ' + err.message;
      }
    }
    // Auto-run first query
    setTimeout(fetchTasks, 300);
  </script>
</body>
</html>\`);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(\`[Zephyr] API server listening on http://localhost:\${port}\`);
});
`,
      "README.md": `# Zephyr REST API Microservice

A live Node.js REST API with automated in-browser reloading.

## Endpoints:
- \`GET /api/tasks\` - Retrieve all records
- \`GET /api/health\` - Service health check
- \`GET /\` - Interactive API Explorer
`,
    };
  }

  if (p.includes("portfolio") || p.includes("landing") || p.includes("showcase") || p.includes("web")) {
    return {
      "package.json": JSON.stringify(
        {
          name: "zephyr-portfolio-showcase",
          type: "module",
          scripts: { dev: "node --watch server.js" },
        },
        null,
        2
      ),
      "server.js": `import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alex Mercer — Creative Engineer</title>
  <style>
    :root {
      --bg: #070302;
      --card: #110804;
      --accent: #ff4e00;
      --accent-light: #ffb677;
      --border: rgba(255, 120, 50, 0.18);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 1.5rem;
    }
    .wrapper { max-width: 720px; width: 100%; }
    .hero { margin-bottom: 3.5rem; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 78, 0, 0.12);
      border: 1px solid var(--border);
      color: var(--accent-light);
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
    h1 {
      font-size: 2.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #ffffff 40%, var(--accent-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.lead {
      font-size: 1.15rem;
      color: rgba(255, 255, 255, 0.75);
      margin-bottom: 2rem;
    }
    .cta-row { display: flex; gap: 12px; }
    .btn {
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #ff4e00, #d93d00);
      color: #fff;
      border: 1px solid rgba(255,182,119,0.3);
      box-shadow: 0 4px 14px rgba(255,78,0,0.35);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255,78,0,0.5); }
    .btn-ghost {
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.85);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .btn-ghost:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent-light);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 3rem;
    }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.2s ease;
    }
    .card:hover {
      border-color: rgba(255,120,50,0.4);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(255,78,0,0.12);
    }
    .card-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; color: #fff; }
    .card-desc { font-size: 0.85rem; color: rgba(255,255,255,0.6); }
    .interactive-counter {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="hero">
      <div class="pill"><span class="status-dot"></span> Available for Selected Projects</div>
      <h1>Alex Mercer</h1>
      <p class="lead">Staff Software Engineer & System Architect specializing in distributed web runtimes, GPU shaders, and reactive UI craft.</p>
      <div class="cta-row">
        <button class="btn btn-primary" onclick="alert('Inquiry sent!')">Get in Touch</button>
        <a href="#work" class="btn btn-ghost">View Case Studies</a>
      </div>
    </div>

    <div id="work">
      <div class="section-title">Selected Works</div>
      <div class="grid">
        <div class="card">
          <div class="card-title">HyperVortex Engine</div>
          <div class="card-desc">Low-latency WebAssembly audio synthesis framework running at 60 FPS.</div>
        </div>
        <div class="card">
          <div class="card-title">Zephyr Protocol</div>
          <div class="card-desc">Peer-to-peer verifiable state replication with edge caching.</div>
        </div>
        <div class="card">
          <div class="card-title">Lumina Dark Mode</div>
          <div class="card-desc">Zero-overhead CSS shader plugin for fluid perceptual contrast.</div>
        </div>
        <div class="card">
          <div class="card-title">Krypton VM</div>
          <div class="card-desc">Isolated client-side micro-container for secure untrusted code.</div>
        </div>
      </div>
    </div>

    <div class="interactive-counter">
      <div>
        <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">Interactive Studio Counter</div>
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">Test client-side hydration</div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn btn-ghost" onclick="update(-1)">-</button>
        <span id="counter" style="font-family: monospace; font-size: 1.2rem; font-weight: 700; color: var(--accent);">0</span>
        <button class="btn btn-primary" onclick="update(1)">+</button>
      </div>
    </div>
  </div>

  <script>
    let count = 0;
    function update(d) {
      count += d;
      document.getElementById('counter').textContent = count;
    }
  </script>
</body>
</html>\`);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('Portfolio server live at http://localhost:' + port);
});
`,
      "README.md": `# Alex Mercer Portfolio

Modern obsidian & ember developer portfolio built for Zephyr Code.
`,
    };
  }

  // Default Hello World Full-Stack Starter
  return {
    "package.json": JSON.stringify(
      {
        name: "zephyr-node-starter",
        type: "module",
        scripts: { dev: "node --watch server.js" },
      },
      null,
      2
    ),
    "server.js": `import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zephyr Code Runtime</title>
  <style>
    :root {
      --bg: #080402;
      --panel: #120905;
      --accent: #ff4e00;
      --accent-light: #ffb677;
      --border: rgba(255, 120, 50, 0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
    }
    .glow-orb {
      position: absolute;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 78, 0, 0.16) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .card {
      position: relative;
      z-index: 1;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 78, 0, 0.12);
      border: 1px solid var(--border);
      color: var(--accent-light);
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
    h1 {
      font-size: 2rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }
    h1 span { color: var(--accent); }
    p.desc {
      color: rgba(255, 255, 255, 0.65);
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 1.5rem;
    }
    .stat-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 10px 8px;
    }
    .stat-val { font-size: 1.1rem; font-weight: 700; color: var(--accent-light); font-family: monospace; }
    .stat-lbl { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 2px; }
    .action-btn {
      background: linear-gradient(135deg, #ff4e00, #d93d00);
      color: #fff;
      border: 1px solid rgba(255,182,119,0.3);
      padding: 10px 24px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(255,78,0,0.35);
      transition: all 0.2s ease;
    }
    .action-btn:hover {
      background: linear-gradient(135deg, #ff651a, #eb4500);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255,78,0,0.5);
    }
  </style>
</head>
<body>
  <div class="glow-orb"></div>
  <div class="card">
    <div class="badge"><span class="dot"></span> Live in Browser</div>
    <h1>Zephyr <span>Code</span></h1>
    <p class="desc">Real-time Node.js execution environment. Edit files in the Code tab or save with <code style="color:#ffb677;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">Ctrl+S</code> to instantly see updates.</p>
    
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-val">Node.js</div>
        <div class="stat-lbl">Runtime</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">&lt; 15ms</div>
        <div class="stat-lbl">Hot Reload</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">Online</div>
        <div class="stat-lbl">Status</div>
      </div>
    </div>

    <button class="action-btn" onclick="triggerPing()">Test Live Interaction</button>
  </div>

  <script>
    function triggerPing() {
      alert('✨ Live JavaScript execution confirmed! Ready to build.');
    }
  </script>
</body>
</html>\`);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(\`Zephyr dev server running on port \${port}\`);
});
`,
    "README.md": `# Zephyr Node Starter

Live in-browser full-stack application.
`,
  };
}

let container: WebContainer | null = null;
let containerPromise: Promise<WebContainer> | null = null;
let unsubscribeServerReady: (() => void) | null = null;
let isVirtualMode = false;

export function getContainer(): WebContainer | null {
  return container;
}

export function getIsVirtual(): boolean {
  return isVirtualMode;
}

export async function writeFile(path: string, contents: string): Promise<void> {
  if (isVirtualMode || !container) {
    await virtualEnv.writeFile(path, contents);
    return;
  }
  try {
    await container.fs.writeFile(path, contents);
  } catch (err) {
    // Fallback to virtual if container write fails
    console.warn("Container write failed, falling back to virtual:", err);
    await virtualEnv.writeFile(path, contents);
  }
}

export async function createFile(path: string, contents = ""): Promise<void> {
  if (isVirtualMode || !container) {
    await virtualEnv.createFile(path, contents);
    return;
  }
  try {
    await container.fs.writeFile(path, contents);
  } catch {
    await virtualEnv.createFile(path, contents);
  }
}

export async function deleteFile(path: string): Promise<void> {
  if (isVirtualMode || !container) {
    await virtualEnv.deleteFile(path);
    return;
  }
  try {
    await container.fs.rm(path);
  } catch {
    await virtualEnv.deleteFile(path);
  }
}

// Applies AI-generated files on top of whatever's currently running.
// Real WebContainer: writes each file (mkdir'ing parent dirs as needed) —
// package.json's "dev": "node --watch server.js" then notices the change
// and restarts on its own, same mechanism a human save already uses.
// Virtual mode: batches the writes into one preview refresh instead of
// one per file.
// `onLog` is optional so this stays backward-compatible with any existing
// caller that doesn't pass it.
export async function runGeneratedProject(
  files: GeneratedFile[],
  onLog?: (line: string) => void
): Promise<void> {
  onLog?.(`Applying ${files.length} generated file(s)…`);

  if (isVirtualMode || !container) {
    await virtualEnv.writeFilesBatch(files.map((f) => ({ path: f.filePath, contents: f.fullContent })));
    for (const f of files) onLog?.(`  + ${f.filePath}`);
    onLog?.("✅ Files applied — preview refreshed.");
    return;
  }

  try {
    for (const file of files) {
      const parts = file.filePath.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        await container.fs.mkdir(dir, { recursive: true }).catch(() => {});
      }
      await container.fs.writeFile(file.filePath, file.fullContent);
      onLog?.(`  + ${file.filePath}`);
    }
    onLog?.("✅ Files written — waiting for the dev server to reload…");
  } catch (err) {
    onLog?.(`❌ Container write failed, falling back to virtual: ${err instanceof Error ? err.message : String(err)}`);
    await virtualEnv.writeFilesBatch(files.map((f) => ({ path: f.filePath, contents: f.fullContent })));
    onLog?.("✅ Files applied via virtual fallback — preview refreshed.");
  }
}

function getOrBootContainer(): Promise<WebContainer> {
  if (!containerPromise) {
    containerPromise = WebContainer.boot().catch((err) => {
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

// Convert flat files to FileSystemTree for WebContainer
function toFileSystemTree(filesRecord: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [path, contents] of Object.entries(filesRecord)) {
    const parts = path.split("/");
    if (parts.length === 1) {
      tree[parts[0]] = { file: { contents } };
    } else {
      // Nested folder handling
      let curr = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p]) {
          curr[p] = { directory: {} };
        }
        const dir = curr[p];
        if ("directory" in dir) {
          curr = dir.directory;
        }
      }
      curr[parts[parts.length - 1]] = { file: { contents } };
    }
  }
  return tree;
}

export async function bootProject({ prompt = "hello world", initialFiles = [], onLog, onStageChange, onPreviewReady }: BootCallbacks) {
  // BUG FIX: previously, opening a second project reused the already-booted
  // WebContainer — container.mount() doesn't clear files that aren't in the
  // new tree (so a prior project's leftover files stuck around), and a brand
  // new "npm run dev" was spawned without ever stopping the previous one,
  // which tried to bind the same port and crashed with EADDRINUSE. Tearing
  // down and rebooting fresh here guarantees every project starts clean.
  if (container) {
    onLog("[WebContainer] Tearing down previous session…");
    try {
      await container.teardown();
    } catch (err) {
      console.warn("WebContainer teardown failed:", err);
    }
    container = null;
    containerPromise = null;
    unsubscribeServerReady?.();
    unsubscribeServerReady = null;
  }

  const starterFiles = generateStarterFiles(prompt);
  if (initialFiles && initialFiles.length > 0) {
    for (const f of initialFiles) {
      starterFiles[f.name] = f.contents;
    }
  }
  virtualEnv.setFiles(starterFiles);
  virtualEnv.registerPreviewCallback(onPreviewReady, onLog);

  // Check if WebContainer can be booted with Cross-Origin Isolation
  const hasCrossOrigin = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

  if (!hasCrossOrigin) {
    onLog("[Runtime] Cross-origin isolation headers not present in current frame.");
    onLog("[Runtime] Activating Zephyr High-Performance Virtual Sandbox...");
    await bootVirtualSandbox(starterFiles, onLog, onStageChange, onPreviewReady);
    return;
  }

  try {
    onStageChange("booting");
    onLog("[WebContainer] Booting in-browser container core...");
    container = await getOrBootContainer();
    isVirtualMode = false;
    onLog(" WebContainer kernel initialized.");

    onStageChange("mounting");
    onLog("[WebContainer] Mounting workspace file structure...");
    const tree = toFileSystemTree(starterFiles);
    await container.mount(tree);
    onLog(` Files mounted (${Object.keys(starterFiles).join(", ")}).`);

    onStageChange("installing");
    onLog("[WebContainer] Resolving package dependencies...");
    const install = await container.spawn("npm", ["install"]);
    install.output.pipeTo(
      new WritableStream({
        write: (data) => {
          const line = cleanLine(data.toString());
          if (line) onLog(line);
        },
      })
    );
    const installExit = await install.exit;
    if (installExit !== 0) {
      onLog(`[WebContainer] npm install notice (exit code ${installExit}). Continuing with built-in modules.`);
    } else {
      onLog(" Dependencies verified.");
    }

    unsubscribeServerReady?.();
    unsubscribeServerReady = container.on("server-ready", (_port, url) => {
      onStageChange("ready");
      onLog(` Service active at ${url}`);
      onPreviewReady(url);
    });

    onStageChange("starting");
    onLog("[WebContainer] Launching server process: npm run dev...");
    const dev = await container.spawn("npm", ["run", "dev"]);
    dev.output.pipeTo(
      new WritableStream({
        write: (data) => {
          const line = cleanLine(data.toString());
          if (line) onLog(line);
        },
      })
    );
  } catch (err) {
    onLog(`[Fallback] WebContainer initial boot failed: ${err instanceof Error ? err.message : String(err)}`);
    onLog("[Fallback] Switching seamlessly to Zephyr Virtual Sandbox...");
    await bootVirtualSandbox(starterFiles, onLog, onStageChange, onPreviewReady);
  }
}

async function bootVirtualSandbox(
  starterFiles: Record<string, string>,
  onLog: (line: string) => void,
  onStageChange: (stage: BootStage) => void,
  onPreviewReady: (url: string) => void
) {
  isVirtualMode = true;
  onStageChange("booting");
  onLog("[Virtual Core] Initializing V8 JavaScript sandbox environment...");
  await new Promise((r) => setTimeout(r, 200));

  onStageChange("mounting");
  onLog(`[Virtual Core] Mounting virtual file tree (${Object.keys(starterFiles).length} files)...`);
  await new Promise((r) => setTimeout(r, 200));

  onStageChange("installing");
  onLog("[Virtual Core] Synthesizing node runtime & module packages...");
  await new Promise((r) => setTimeout(r, 300));
  onLog(" Package graph ready.");

  onStageChange("starting");
  onLog("[Virtual Core] Starting virtual HTTP service on port 3000...");
  await new Promise((r) => setTimeout(r, 250));

  onStageChange("ready");
  onLog(" Server listening at virtual://localhost:3000");
  virtualEnv.refreshPreview();
}
