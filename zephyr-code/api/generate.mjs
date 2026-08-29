// POST /api/generate
// Body: { prompt: string }
// Response: { files: [{ filePath, fullContent }, ...] }
//
// Two-phase pipeline (not routing anymore):
//   Phase 1 — Gemini 3.6 Flash builds the UI (public/index.html, style.css,
//             script.js) AND writes a plain-English description of exactly
//             what backend behavior that UI needs (which endpoints it
//             calls, what shape of data it expects back).
//   Phase 2 — Nemotron 3 Ultra, given that description plus a detailed
//             engineering system prompt, builds package.json + server.js
//             to match it exactly.
// Output contract is unchanged: still {files: [{filePath, fullContent}]}.
// Nothing downstream (runGeneratedProject, generate.ts, App.tsx) needs to
// change because of any of this.

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// ── Phase 1: Gemini builds the UI ───────────────────────────────────────

const GEMINI_SYSTEM_INSTRUCTION = `You design and build the FRONTEND ONLY of a small web app that will run inside a WebContainer (a constrained Node.js runtime in the browser). A separate backend engineer will build the server afterward based on your description — so your job has two parts.

PART A — Build the UI:
- public/index.html — the app's markup.
- public/style.css — real, polished styling. Not bare-bones.
- public/script.js — client-side interactivity. Use fetch() for any data the UI needs from a server — assume a backend WILL exist at the paths you call, even though it doesn't exist yet.

PART B — Describe the backend you need:
Write a clear, complete, unambiguous description of every endpoint your script.js calls: exact path, HTTP method, what the request body/query looks like (if any), and the exact shape of the JSON response your frontend code expects back. Be specific enough that someone who has never seen your UI could implement a matching backend from your description alone.

Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{
  "files": [
    { "filePath": "public/index.html", "fullContent": "..." },
    { "filePath": "public/style.css", "fullContent": "..." },
    { "filePath": "public/script.js", "fullContent": "..." }
  ],
  "backendRequirements": "..."
}

If the app genuinely needs no backend data at all (a purely static page), still return "backendRequirements" explaining that plainly — never omit the field.`;

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    files: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING" },
          fullContent: { type: "STRING" },
        },
        required: ["filePath", "fullContent"],
      },
    },
    backendRequirements: { type: "STRING" },
  },
  required: ["files", "backendRequirements"],
};

async function callGeminiForUI(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.files) || typeof parsed.backendRequirements !== "string") {
    throw new Error("Gemini's JSON didn't match the expected {files, backendRequirements} shape.");
  }
  return parsed;
}

// ── Phase 2: Nemotron builds the backend to match ───────────────────────
// This is the "Claude/Codex-style" system prompt — detailed engineering
// guidance and specific bug patterns to avoid, not just a task description.

const NEMOTRON_SYSTEM_INSTRUCTION = `You are an expert Node.js backend engineer. Another engineer has already built a frontend and given you an exact description of the backend it needs. Your job is to build a server that satisfies that description precisely, using ONLY Node's built-in modules — no Express, no npm dependencies of any kind, since installs must stay fast and dependency-free inside a WebContainer sandbox.

OUTPUT — exactly these two files, nothing else:
- package.json — "type": "module", "scripts": { "dev": "node --watch server.js" }, no "dependencies" field.
- server.js — a plain node:http server. Must listen on: const port = process.env.PORT || 3111;
  It must ALSO serve the static frontend files from ./public (the frontend already exists — read files from that directory and serve them for any request that isn't one of your API routes).

IMPLEMENTATION RULES:
1. Implement every endpoint in the backend description exactly — same path, same method, same response shape. If the frontend expects { "status": "success", "data": [...] }, return exactly that shape, not something close to it.
2. Use in-memory storage (a plain array or object at module scope) since there's no database. Seed it with a few realistic example records so the UI has something to show immediately on first load.
3. Wrap your whole request handler in try/catch. A single bad request (malformed JSON body, missing field, unexpected type) must return a clean 4xx JSON error — it must NEVER crash the process.
4. Set correct headers: "Content-Type": "application/json" for API responses, correct MIME type for static files (.html → text/html, .css → text/css, .js → text/javascript).
5. Enable CORS: Access-Control-Allow-Origin: *, and handle OPTIONS preflight requests by responding 204 immediately, before any other routing logic.
6. When parsing a request body, always collect it via the 'data'/'end' events on the request stream and JSON.parse inside a try/catch — never assume the body is valid JSON.
7. Match paths carefully: use exact string equality or a real router-style check, not a loose .includes() that could accidentally match the wrong route (e.g. "/api/task" incorrectly matching a request for "/api/tasks/123").
8. Validate required fields exist and are the right type BEFORE using them — this is the most common source of an uncaught TypeError crashing a naive server.
9. Add a console.log for each meaningful action (server start, each request handled) — these logs are the only visibility the frontend engineer has into whether your server is behaving correctly.
10. Common mistakes to specifically avoid: forgetting to call res.end() (hangs the request forever), calling res.writeHead() twice on one response, not handling the case where req.url has query params when matching pathnames (parse with the URL constructor, don't string-match req.url directly).

Respond with ONLY a JSON array, no markdown fences, no prose:
[{ "filePath": "package.json", "fullContent": "..." }, { "filePath": "server.js", "fullContent": "..." }]`;

async function callNemotronForBackend(originalPrompt, backendRequirements, apiKey) {
  const userMessage = `Original app request: ${originalPrompt}\n\nBackend requirements from the frontend engineer:\n${backendRequirements}`;

  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: NEMOTRON_SYSTEM_INSTRUCTION },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      chat_template_kwargs: { enable_thinking: false, force_nonempty_content: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Nemotron API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Nemotron returned no content.");
  return parseFilesArray(text);
}

function parseFilesArray(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1];

  let files;
  try {
    files = JSON.parse(cleaned);
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Response wasn't valid JSON and no JSON array could be found in it.");
    files = JSON.parse(arrayMatch[0]);
  }

  if (!Array.isArray(files) || files.some((f) => typeof f?.filePath !== "string" || typeof f?.fullContent !== "string")) {
    throw new Error("JSON didn't match the expected {filePath, fullContent}[] shape.");
  }
  return files;
}

// A minimal static-file server, used ONLY if Nemotron fails after Gemini
// already succeeded — so a backend-only failure never leaves the user
// stranded with nothing running at all.
function fallbackServerFiles() {
  return [
    {
      filePath: "package.json",
      fullContent: JSON.stringify(
        { name: "zephyr-fallback-server", type: "module", scripts: { dev: "node --watch server.js" } },
        null,
        2
      ),
    },
    {
      filePath: "server.js",
      fullContent: `import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  const filePath = path.join("public", urlPath === "/" ? "index.html" : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const port = process.env.PORT || 3111;
server.listen(port, () => console.log("Fallback static server on port " + port));
`,
    },
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Request body must include a non-empty 'prompt' string." });
    return;
  }
  if (!geminiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not set on this deployment." });
    return;
  }

  try {
    // Phase 1 — UI, plus the spec for phase 2. Nothing to fall back to if
    // this fails: there's no UI yet for a backend to match.
    const { files: uiFiles, backendRequirements } = await callGeminiForUI(prompt, geminiKey);

    // Phase 2 — backend, built to match phase 1's spec.
    let backendFiles;
    let model = "gemini+nemotron";
    if (!nvidiaKey) {
      backendFiles = fallbackServerFiles();
      model = "gemini+fallback (NVIDIA_API_KEY not set)";
    } else {
      try {
        backendFiles = await callNemotronForBackend(prompt, backendRequirements, nvidiaKey);
      } catch (err) {
        backendFiles = fallbackServerFiles();
        model = `gemini+fallback (Nemotron failed: ${err instanceof Error ? err.message : String(err)})`;
      }
    }

    res.setHeader("X-Zephyr-Model", model);
    res.status(200).json({ files: [...uiFiles, ...backendFiles] });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
