// POST /api/generate
// Body: { prompt: string, existingFiles?: [{ path, contents }, ...] }
// Response: { files, reply, featureList, apiContract, backendChangeNeeded }
//
// Two-phase pipeline:
//   Phase 1 — Gemini 3.6 Flash builds/edits the UI AND decides a structured
//             API contract (not prose) describing exactly what the backend
//             needs to do, plus a conversational "reply" and the feature
//             list it's building.
//   Phase 2 — Nemotron 3 Ultra, given that contract, builds/patches
//             package.json + server.js to match it exactly. Skipped
//             entirely when the turn doesn't need backend changes.
//
// EDIT MODE: when `existingFiles` is provided (i.e. this isn't the first
// generation for a project), both phases are told this is a continuation
// of an already-running app — not a new one — and are instructed to only
// touch what the instruction actually requires, or to answer in plain
// chat via "reply" with an empty "files" array when no code change is
// needed at all (e.g. a question, or something about deployment/config).
// This is what fixes "rename it X" or "how do I deploy this" building an
// unrelated app from scratch: the model previously had zero visibility
// into the fact that a project already existed.

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Keep model context small and relevant: lockfiles are noise, and very
// large files would blow the prompt budget for little benefit.
const MAX_CONTEXT_FILE_CHARS = 20000;

function filterExistingFiles(rawExistingFiles) {
  if (!Array.isArray(rawExistingFiles)) return [];
  return rawExistingFiles.filter(
    (f) =>
      f &&
      typeof f.path === "string" &&
      typeof f.contents === "string" &&
      f.path !== "package-lock.json" &&
      f.contents.length <= MAX_CONTEXT_FILE_CHARS
  );
}

function serializeFiles(files) {
  return files.map((f) => `--- FILE: ${f.path} ---\n${f.contents}`).join("\n\n");
}

// ── Phase 1: Gemini builds/edits the UI ─────────────────────────────────

const FEATURE_LIST_GUIDANCE = `Before writing any code, decide the feature set for this turn:
- If the user named specific features, include every one of them.
- Add any other feature a real, usable version of this kind of app would obviously need (e.g. a to-do app needs its list to persist within the session; a chatbot needs message history and a visible way to send a message; a weather app needs to handle an unknown city gracefully). Use judgment about what's genuinely expected versus unrelated scope creep.
- If the user gave no feature detail at all, invent a sensible, complete feature set yourself for that category of app.
- Build ALL of the decided features in this pass, not just a bare skeleton.
- Return the feature list as short phrases in "featureList".`;

function buildGeminiSystemInstruction(isEdit) {
  const shared = `You are the frontend engineer for a small web app that runs inside a WebContainer (a constrained Node.js runtime in the browser). A separate backend engineer builds server.js/package.json, coordinated only through the API contract you write — they never see your reasoning, so the contract has to be precise.

${FEATURE_LIST_GUIDANCE}

Respond with ONLY a JSON object, no markdown fences, no prose outside the JSON, in exactly this shape:
{
  "reply": "...",
  "featureList": ["...", "..."],
  "files": [ { "filePath": "public/index.html", "fullContent": "..." } ],
  "backendChangeNeeded": true,
  "apiContract": [
    { "method": "GET", "path": "/api/messages", "description": "...", "requestShape": "none", "responseShape": "{ status: \\"success\\", data: [...] }" }
  ]
}

- "reply" is a short, first-person message for the chat log describing what you actually did this turn — or, when no code needed to change, your direct answer to the user instead.
- "apiContract" must list every endpoint the UI calls, each with a concrete path, method, and exact response shape — this is the backend engineer's entire spec, so be precise. Leave it empty only when "backendChangeNeeded" is false.
- "backendChangeNeeded" is true only if the backend genuinely needs to be created or changed this turn.`;

  if (!isEdit) {
    return `${shared}

This is a BRAND NEW project — there are no existing files yet. Build the full first version:
- public/index.html, public/style.css, public/script.js — a real, polished UI, not a bare skeleton.
- script.js uses fetch() against the paths in your apiContract for any data the UI needs.
- "files" must include all three of those.`;
  }

  return `${shared}

This is an EDIT to an EXISTING, already-running project — you are given its current files below. The user's instruction this turn might be a UI change, a rename, a new feature, a question, or something about hosting/deployment/config that needs no code at all.

CRITICAL RULES FOR EDITS:
- The files you're given ARE the app. Never invent a new, different, unrelated app, no matter how short or vague the instruction is. "Rename it Vertex" means change THIS app's name/branding to "Vertex" — it is not a request to build something new called Vertex.
- Only include files in "files" that actually need to change this turn. Anything you leave out is preserved exactly as-is — you do not need to (and should not) re-send unrelated files.
- When you do touch a file, preserve everything in it that isn't related to this instruction. A full rewrite is only appropriate when the requested change is genuinely that broad.
- If the instruction needs no code change at all — a question, a request for advice, anything about hosting/deployment/config that lives outside this app's own files — return an empty "files" array and put your real answer in "reply". Never fabricate files just to have something to show.
- If new UI needs new or changed backend behavior, describe it completely in "apiContract" so the backend engineer (who only sees their existing files plus this contract) can implement it correctly.`;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    featureList: { type: "ARRAY", items: { type: "STRING" } },
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
    backendChangeNeeded: { type: "BOOLEAN" },
    apiContract: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          method: { type: "STRING" },
          path: { type: "STRING" },
          description: { type: "STRING" },
          requestShape: { type: "STRING" },
          responseShape: { type: "STRING" },
        },
        required: ["method", "path", "description", "responseShape"],
      },
    },
  },
  required: ["reply", "featureList", "files", "backendChangeNeeded", "apiContract"],
};

async function callGeminiForUI(prompt, existingFiles, apiKey) {
  const isEdit = existingFiles.length > 0;
  const userMessage = isEdit
    ? `EXISTING PROJECT FILES (this is the app currently running — the source of truth, not a starting point to reinvent):\n\n${serializeFiles(
        existingFiles
      )}\n\n---\n\nUSER'S INSTRUCTION FOR THIS TURN: ${prompt}`
    : prompt;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: buildGeminiSystemInstruction(isEdit) }] },
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
  if (!Array.isArray(parsed.files) || typeof parsed.reply !== "string") {
    throw new Error("Gemini's JSON didn't match the expected response shape.");
  }

  return {
    reply: parsed.reply,
    featureList: Array.isArray(parsed.featureList) ? parsed.featureList : [],
    files: parsed.files,
    backendChangeNeeded: Boolean(parsed.backendChangeNeeded),
    apiContract: Array.isArray(parsed.apiContract) ? parsed.apiContract : [],
  };
}

// ── Phase 2: Nemotron builds/patches the backend to match the contract ──

function renderContract(apiContract) {
  if (!apiContract || apiContract.length === 0) return "(no endpoints — this app needs no real API)";
  return apiContract
    .map(
      (e) =>
        `${e.method} ${e.path}\n  Purpose: ${e.description}\n  Request: ${e.requestShape || "none"}\n  Response: ${e.responseShape}`
    )
    .join("\n\n");
}

function buildNemotronSystemInstruction(isEdit) {
  const base = `You are an expert Node.js backend engineer. A frontend engineer has already built the UI and given you a precise API contract. Your job is to build a server that satisfies that contract exactly, using ONLY Node's built-in modules — no Express, no npm dependencies of any kind, since installs must stay fast and dependency-free inside a WebContainer sandbox.

OUTPUT — exactly these two files, nothing else:
- package.json — "type": "module", "scripts": { "dev": "node --watch server.js" }, no "dependencies" field.
- server.js — a plain node:http server. Must listen on: const port = process.env.PORT || 3111;
  It must ALSO serve the static frontend files from ./public (the frontend already exists — read files from that directory and serve them for any request that isn't one of your API routes).

IMPLEMENTATION RULES:
1. Implement every endpoint in the contract exactly — same path, same method, same response shape. If the contract says { "status": "success", "data": [...] }, return exactly that shape, not something close to it.
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

  if (!isEdit) return base;

  return `${base}

EDIT MODE: you're given the existing package.json and server.js below. Patch them to satisfy the (possibly updated) contract — preserve existing routes, seed data, and structure that the contract still calls for. Don't discard working, still-relevant endpoints just because they weren't repeated in the contract; only change what the contract actually requires.`;
}

async function callNemotronForBackend(prompt, apiContract, existingBackendFiles, apiKey) {
  const isEdit = existingBackendFiles.length > 0;
  const contractText = renderContract(apiContract);
  const existingText = isEdit
    ? `\n\nEXISTING BACKEND FILES (patch these, don't discard them):\n\n${serializeFiles(existingBackendFiles)}`
    : "";
  const userMessage = `Original app request: ${prompt}\n\nAPI contract to implement exactly:\n\n${contractText}${existingText}`;

  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: buildNemotronSystemInstruction(isEdit) },
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

// A minimal static-file server. Used for brand-new projects that don't
// need a real API at all (skips Nemotron entirely — faster and cheaper
// than asking a backend model to build nothing), and as a last resort if
// Nemotron fails on a brand-new project's build.
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

  const { prompt, existingFiles: rawExistingFiles } = req.body ?? {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Request body must include a non-empty 'prompt' string." });
    return;
  }
  if (!geminiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not set on this deployment." });
    return;
  }

  const existingFiles = filterExistingFiles(rawExistingFiles);
  const isEdit = existingFiles.length > 0;

  try {
    // Phase 1 — UI (or the answer, if no code needs to change), plus the
    // contract for phase 2. Nothing to fall back to if this fails: there's
    // no UI yet for a backend to match, and no answer to give the user.
    const { reply, featureList, files: uiFiles, backendChangeNeeded, apiContract } = await callGeminiForUI(
      prompt,
      existingFiles,
      geminiKey
    );

    let backendFiles = [];
    let backendNote = "";
    let model = "gemini";

    if (backendChangeNeeded) {
      const existingBackendFiles = existingFiles.filter((f) => f.path === "server.js" || f.path === "package.json");

      if (!nvidiaKey) {
        if (isEdit) {
          backendNote = " (Backend changes were needed but the Nemotron API key isn't configured on this deployment, so only the UI was updated.)";
        } else {
          backendFiles = fallbackServerFiles();
          model = "gemini+fallback (NVIDIA_API_KEY not set)";
        }
      } else {
        try {
          backendFiles = await callNemotronForBackend(prompt, apiContract, existingBackendFiles, nvidiaKey);
          model = "gemini+nemotron";
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (isEdit) {
            // Don't nuke a working custom backend with a generic static
            // server just because this turn's patch failed — leave it
            // untouched and say so.
            backendNote = ` (Backend update failed: ${message} — the existing backend was left unchanged.)`;
          } else {
            backendFiles = fallbackServerFiles();
            model = `gemini+fallback (Nemotron failed: ${message})`;
          }
        }
      }
    } else if (!isEdit) {
      // Brand-new, purely static project — still needs *something* to
      // serve it, but there's no real API to build, so skip the
      // expensive backend-model call entirely.
      backendFiles = fallbackServerFiles();
      model = "gemini+static";
    }

    const files = [...uiFiles, ...backendFiles];
    const finalReply = (reply && reply.trim() ? reply : "Done.") + backendNote;

    res.setHeader("X-Zephyr-Model", model);
    res.status(200).json({
      files,
      reply: finalReply,
      featureList,
      apiContract,
      backendChangeNeeded,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
