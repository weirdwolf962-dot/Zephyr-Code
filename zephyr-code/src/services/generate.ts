// POST /api/generate
// Body: { prompt: string, existingFiles?: [{ path, contents }, ...] }
// Response: { files, reply, featureList, apiContract, backendChangeNeeded }
//
// PIPELINE
// ────────
// Phase 0 — REFINE (Gemini 2.5 Flash)
//   Turns the user's raw prompt into a complete, unambiguous feature spec.
//   Runs on every turn, new project or edit. Never writes code.
//
// Phase 1 — BUILD
//   NEW PROJECT: Gemini 3.6 Flash (UI) and Nemotron 3 Ultra (backend) build
//   IN PARALLEL from the same refined spec. Neither sees the other's output
//   yet — Gemini guesses the API shape it wants, Nemotron infers the API
//   it needs from the spec directly. This is reconciled in Phase 2.
//
//   EDIT: Nemotron acts as the edit orchestrator. It reads the refined
//   instruction plus every existing file and decides: can it satisfy this
//   itself (backend/logic change, or a UI tweak small enough to patch
//   directly), or does the change need real UI work (a new page, a new
//   section, a structural layout change)? If the latter, it hands a
//   precise UI instruction to Gemini 3.6 Flash and lets it build/patch the
//   UI in parallel with whatever backend work Nemotron is doing itself.
//
// Phase 2 — CONNECT & DEBUG (Nemotron 3 Ultra)
//   Only runs when Gemini was involved this turn (every new project, and
//   any edit that needed Gemini's UI work). Nemotron is handed the actual
//   UI files and the actual backend files, cross-checks every fetch() call
//   in the frontend against the backend's routes, patches any mismatch,
//   and sweeps both sides for logical bugs before anything reaches the
//   user. When Nemotron handled an edit entirely on its own (no Gemini
//   involved), this phase is skipped — its own system prompt already
//   requires it to debug as it goes, so a second pass would just be a
//   redundant, expensive no-op.

const GEMINI_REFINE_MODEL = "gemini-2.5-flash";
const GEMINI_UI_MODEL = "gemini-3.6-flash";
const GEMINI_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
  if (!files || files.length === 0) return "(none)";
  return files.map((f) => `--- FILE: ${f.path} ---\n${f.contents}`).join("\n\n");
}

function isBackendPath(path) {
  return path === "server.js" || path === "package.json";
}

// Later arrays win on path collisions. Order of first appearance is
// preserved so the response stays stable/readable.
function mergeFiles(...fileArrays) {
  const order = [];
  const byPath = new Map();
  for (const arr of fileArrays) {
    for (const f of arr || []) {
      if (!f || typeof f.filePath !== "string" || typeof f.fullContent !== "string") continue;
      if (!byPath.has(f.filePath)) order.push(f.filePath);
      byPath.set(f.filePath, f.fullContent);
    }
  }
  return order.map((filePath) => ({ filePath, fullContent: byPath.get(filePath) }));
}

function toContextFiles(generatedFiles) {
  // Reshape {filePath, fullContent}[] into the {path, contents}[] shape
  // used for serializing "current state" into later prompts.
  return (generatedFiles || []).map((f) => ({ path: f.filePath, contents: f.fullContent }));
}

// ── JSON helpers ─────────────────────────────────────────────────────────

function extractJsonObject(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  try {
    return JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Response wasn't valid JSON and no JSON object could be found in it.");
    return JSON.parse(objMatch[0]);
  }
}

function extractJsonArray(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("not an array");
  } catch {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrMatch) throw new Error("Response wasn't valid JSON and no JSON array could be found in it.");
    return JSON.parse(arrMatch[0]);
  }
}

function assertFileShape(files, label) {
  if (!Array.isArray(files) || files.some((f) => typeof f?.filePath !== "string" || typeof f?.fullContent !== "string")) {
    throw new Error(`${label} didn't match the expected {filePath, fullContent}[] shape.`);
  }
  return files;
}

async function callGemini(model, systemInstruction, userMessage, responseSchema, apiKey) {
  const res = await fetch(`${GEMINI_URL_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${model} API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${model} returned no content.`);
  return extractJsonObject(text);
}

async function callNemotron(systemInstruction, userMessage, apiKey, { temperature = 0.2, maxTokens = 8192 } = {}) {
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
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
  return text;
}

// ── Phase 0: REFINE (Gemini 2.5 Flash) ──────────────────────────────────

const REFINE_SCHEMA = {
  type: "OBJECT",
  properties: {
    refinedPrompt: { type: "STRING" },
    featureList: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["refinedPrompt", "featureList"],
};

function buildRefineSystemInstruction(isEdit) {
  const shared = `You are a product analyst. Your only job is to turn a short, possibly vague instruction into a complete, unambiguous engineering specification for two other AI engineers — one who will build the UI, one who will build the backend, working in parallel and never talking to each other directly except through what you write. You never write code and never mention code, files, or implementation details like frameworks or libraries — only product behavior.

Produce:
- "refinedPrompt": a complete, precise description of exactly what should exist after this turn. Resolve ambiguity yourself. Name every screen, section, and piece of user-visible behavior. State explicit behavior for edge cases (empty states, invalid input, loading, errors) whenever the app category would obviously need them.
- "featureList": the concrete features this implies, as short phrases.`;

  if (!isEdit) {
    return `${shared}

This is a BRAND NEW app being built from scratch. If the user gave sparse detail, invent a sensible, complete feature set yourself for that category of app — don't pass along vagueness for someone else to guess at.`;
  }

  return `${shared}

This is a CHANGE to an app that already exists and is already running (you're given a short list of its current files below for context, not their contents). Refine only what this turn's instruction is actually asking for — do not invent unrelated new scope, and do not restate or redesign parts of the app the instruction doesn't touch. If the instruction is really just a question or unrelated to app behavior (e.g. about deployment), say so plainly in "refinedPrompt" instead of inventing a feature.`;
}

async function refinePrompt(prompt, existingFiles, apiKey) {
  const isEdit = existingFiles.length > 0;
  const userMessage = isEdit
    ? `Existing app's current files (for context only): ${existingFiles.map((f) => f.path).join(", ") || "(none)"}\n\nInstruction for this turn: ${prompt}`
    : `App request: ${prompt}`;

  try {
    const parsed = await callGemini(GEMINI_REFINE_MODEL, buildRefineSystemInstruction(isEdit), userMessage, REFINE_SCHEMA, apiKey);
    if (typeof parsed.refinedPrompt !== "string" || !parsed.refinedPrompt.trim()) throw new Error("empty refinedPrompt");
    return {
      refinedPrompt: parsed.refinedPrompt,
      featureList: Array.isArray(parsed.featureList) ? parsed.featureList : [],
    };
  } catch (err) {
    // Refinement is an optimization, not a hard dependency — if it fails,
    // fall through to the raw prompt so the turn can still proceed.
    return { refinedPrompt: prompt, featureList: [] };
  }
}

// ── Phase 1a: Gemini 3.6 Flash builds/edits the UI ──────────────────────

const GEMINI_UI_SCHEMA = {
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
  required: ["reply", "featureList", "files", "apiContract"],
};

function buildGeminiUISystemInstruction(isEdit) {
  const shared = `You are the frontend engineer for a small web app that runs inside a WebContainer (a constrained Node.js runtime in the browser). A backend engineer is building server.js/package.json for this same app at the same time as you, from the same specification — you will not see their code, and they will not see yours, until an integration pass reconciles you both afterward. Because of that, be concrete and consistent about what API you expect: use sensible, conventional REST paths so a competent backend engineer independently arrives at the same shape you did.

Respond with ONLY a JSON object, no markdown fences, no prose outside the JSON, in exactly this shape:
{
  "reply": "...",
  "featureList": ["...", "..."],
  "files": [ { "filePath": "public/index.html", "fullContent": "..." } ],
  "apiContract": [
    { "method": "GET", "path": "/api/messages", "description": "...", "requestShape": "none", "responseShape": "{ status: \\"success\\", data: [...] }" }
  ]
}

- "reply" is a short, first-person message for the chat log describing what you actually did this turn — or, when no code needed to change, your direct answer to the user instead.
- "apiContract" must list every endpoint your script.js actually calls, each with a concrete path, method, and exact response shape — this is what the integration pass will reconcile against the real backend. Leave it empty if this app needs no backend at all.`;

  if (!isEdit) {
    return `${shared}

This is a BRAND NEW project — there are no existing files yet. Build the full first version:
- public/index.html, public/style.css, public/script.js — a real, polished UI, not a bare skeleton.
- script.js uses fetch() against the paths in your apiContract for any data the UI needs.
- "files" must include all three of those.`;
  }

  return `${shared}

This is an EDIT to an EXISTING, already-running project — you are given its current UI files below, and an instruction for what to change. Sometimes that instruction comes verbatim from the user; sometimes it has been translated by another engineer into a precise UI-only task (e.g. "add a settings page with X, Y, Z") — either way, treat it as the exact scope of what to build.

CRITICAL RULES FOR EDITS:
- The files you're given ARE the app. Never invent a new, different, unrelated app.
- Only include files in "files" that actually need to change this turn. Anything you leave out is preserved exactly as-is.
- When you do touch a file, preserve everything in it that isn't related to this instruction. A full rewrite is only appropriate when the requested change is genuinely that broad.
- If the instruction needs new or changed backend behavior, describe it completely in "apiContract" so the integration pass can make sure the backend actually matches.`;
}

async function callGeminiForUI(refinedPrompt, featureList, existingUIFiles, isEdit, apiKey) {
  const featureText = featureList.length ? `\n\nFeature spec for this turn:\n- ${featureList.join("\n- ")}` : "";
  const userMessage = isEdit
    ? `EXISTING UI FILES (this is the app currently running):\n\n${serializeFiles(existingUIFiles)}\n\n---\n\nINSTRUCTION FOR THIS TURN: ${refinedPrompt}${featureText}`
    : `${refinedPrompt}${featureText}`;

  const parsed = await callGemini(GEMINI_UI_MODEL, buildGeminiUISystemInstruction(isEdit), userMessage, GEMINI_UI_SCHEMA, apiKey);
  if (!Array.isArray(parsed.files) || typeof parsed.reply !== "string") {
    throw new Error("Gemini's JSON didn't match the expected response shape.");
  }
  return {
    reply: parsed.reply,
    featureList: Array.isArray(parsed.featureList) ? parsed.featureList : [],
    files: assertFileShape(parsed.files, "Gemini UI response"),
    apiContract: Array.isArray(parsed.apiContract) ? parsed.apiContract : [],
  };
}

// ── Phase 1b: Nemotron 3 Ultra builds the backend, in parallel ─────────

function buildNemotronBackendCommonRules() {
  return `Build the server using ONLY Node's built-in modules — no Express, no npm dependencies of any kind, since installs must stay fast and dependency-free inside a WebContainer sandbox.

OUTPUT — exactly these two files, nothing else:
- package.json — "type": "module", "scripts": { "dev": "node --watch server.js" }, no "dependencies" field.
- server.js — a plain node:http server. Must listen on: const port = process.env.PORT || 3111;
  It must ALSO serve the static frontend files from ./public for any request that isn't one of your API routes.

IMPLEMENTATION RULES:
1. Use in-memory storage (a plain array or object at module scope) since there's no database. Seed it with a few realistic example records so the UI has something to show immediately on first load.
2. Wrap your whole request handler in try/catch. A single bad request (malformed JSON body, missing field, unexpected type) must return a clean 4xx JSON error — it must NEVER crash the process.
3. Set correct headers: "Content-Type": "application/json" for API responses, correct MIME type for static files (.html → text/html, .css → text/css, .js → text/javascript).
4. Enable CORS: Access-Control-Allow-Origin: *, and handle OPTIONS preflight requests by responding 204 immediately, before any other routing logic.
5. When parsing a request body, always collect it via the 'data'/'end' events on the request stream and JSON.parse inside a try/catch — never assume the body is valid JSON.
6. Match paths carefully: use exact string equality or a real router-style check, not a loose .includes() that could accidentally match the wrong route.
7. Validate required fields exist and are the right type BEFORE using them.
8. Add a console.log for each meaningful action (server start, each request handled).
9. Common mistakes to specifically avoid: forgetting to call res.end() (hangs the request forever), calling res.writeHead() twice on one response, not handling query params when matching pathnames (parse with the URL constructor, don't string-match req.url directly).`;
}

function buildNemotronBackendDraftSystemInstruction() {
  return `You are an expert Node.js backend engineer. A frontend engineer is building the UI for this same app, right now, in parallel — you will not see their code, and they will not see yours, until an integration pass reconciles you both afterward. Work from the feature specification below and infer the REST API a competent frontend engineer would conventionally expect for an app like this: predictable, RESTful paths (e.g. GET/POST /api/<resource>, GET/PUT/DELETE /api/<resource>/:id), matching common naming.

${buildNemotronBackendCommonRules()}

Respond with ONLY a JSON array, no markdown fences, no prose:
[{ "filePath": "package.json", "fullContent": "..." }, { "filePath": "server.js", "fullContent": "..." }]`;
}

async function callNemotronBackendDraft(refinedPrompt, featureList, apiKey) {
  const featureText = featureList.length ? `\n\nFeature spec:\n- ${featureList.join("\n- ")}` : "";
  const userMessage = `App request: ${refinedPrompt}${featureText}`;
  const text = await callNemotron(buildNemotronBackendDraftSystemInstruction(), userMessage, apiKey);
  return assertFileShape(extractJsonArray(text), "Nemotron backend draft response");
}

// ── Phase 1 (edit path): Nemotron as edit orchestrator ──────────────────

const NEMOTRON_EDIT_SCHEMA_NOTE = `Respond with ONLY a JSON object, no markdown fences, no prose outside the JSON, in exactly this shape:
{
  "needsGeminiUI": false,
  "uiInstruction": "",
  "files": [ { "filePath": "server.js", "fullContent": "..." } ],
  "reply": "..."
}`;

function buildNemotronEditOrchestratorSystemInstruction() {
  return `You are the lead engineer for a small already-running web app inside a WebContainer. You own the backend, the app's logic end-to-end, and all debugging — and you also handle small, contained UI patches yourself. You are given the full current source of the app and an instruction for this turn. Decide:

1. Can you satisfy this instruction entirely yourself? You can, if it's a backend/logic change, a data/behavior change, or a UI tweak small and contained enough to patch directly in the existing files (copy change, style tweak, small conditional, a new field on an existing view, a small addition to existing markup). If so, set "needsGeminiUI": false, make the change yourself (touching whatever files it actually requires, backend and/or UI), and leave "uiInstruction" empty.

2. Does this instruction require real UI work — a new page, a new route/section, a materially new layout or component, something big enough that building it yourself risks a worse result than a dedicated frontend engineer? If so, set "needsGeminiUI": true, and write "uiInstruction": a precise, complete instruction for that frontend engineer describing exactly what UI to build or change (they will not see the user's original wording, only what you write). In this case, only include files you are handling yourself this turn in "files" — e.g. backend changes this UI work will need — and do NOT touch UI files; leave that entirely to the frontend engineer to avoid both of you editing the same file.

Whichever path you take, when you touch backend code:
${buildNemotronBackendCommonRules()}

CRITICAL RULES:
- The files you're given ARE the app. Never invent a new, different, unrelated app.
- Only include files in "files" that actually need to change this turn (or, if needsGeminiUI is true, that you are handling yourself alongside it). Anything left out is preserved exactly as-is.
- When you touch a file, preserve everything in it unrelated to this instruction.
- If the instruction needs no code change at all — a question, deployment/config advice, anything outside the app's own files — set "needsGeminiUI": false, return an empty "files" array, and put your real answer in "reply".
- Always debug as you go: never hand back code with an obvious crash, unhandled case, or route mismatch you could have caught yourself.

${NEMOTRON_EDIT_SCHEMA_NOTE}`;
}

async function callNemotronEditOrchestrator(refinedPrompt, existingFiles, apiKey) {
  const userMessage = `EXISTING PROJECT FILES (this is the app currently running — the source of truth):\n\n${serializeFiles(
    existingFiles
  )}\n\n---\n\nINSTRUCTION FOR THIS TURN: ${refinedPrompt}`;

  const text = await callNemotron(buildNemotronEditOrchestratorSystemInstruction(), userMessage, apiKey);
  const parsed = extractJsonObject(text);
  if (typeof parsed.reply !== "string") throw new Error("Nemotron edit-orchestrator response didn't match the expected shape.");
  return {
    needsGeminiUI: Boolean(parsed.needsGeminiUI),
    uiInstruction: typeof parsed.uiInstruction === "string" ? parsed.uiInstruction : "",
    files: assertFileShape(Array.isArray(parsed.files) ? parsed.files : [], "Nemotron edit-orchestrator response"),
    reply: parsed.reply,
  };
}

// ── Phase 2: Nemotron connects UI + backend and debugs both ────────────

function buildNemotronConnectSystemInstruction() {
  return `You are doing final integration and QA on a small web app. Two other engineers just built its pieces independently — a frontend engineer built the UI, a backend engineer (possibly you, a moment ago) built the server — and they never saw each other's code. Your job now:

1. Read the actual UI files and actual backend files below. Find every fetch()/XHR call the UI makes (method + path + expected request/response shape) and compare it against what the backend actually implements.
2. Fix every mismatch by editing server.js: add any route the UI calls that's missing, correct any route whose response shape doesn't match what the UI expects, fix any path or method mismatch. Prefer changing the backend to match the UI (the UI is what the user sees and interacted with) unless the backend's version is clearly the more sensible/correct one, in which case note that instead.
3. Sweep BOTH the UI and backend code for logical bugs, not just endpoint mismatches: unhandled errors, missing null/undefined checks, off-by-one mistakes, race conditions, broken control flow, dead code paths, anything that would visibly break or silently misbehave for a real user.
4. Fix what you find directly. Do not just report bugs — output corrected files.

${buildNemotronBackendCommonRules()}

Respond with ONLY a JSON object, no markdown fences, no prose outside the JSON, in exactly this shape:
{
  "files": [ { "filePath": "server.js", "fullContent": "..." } ],
  "apiContract": [
    { "method": "GET", "path": "/api/messages", "description": "...", "requestShape": "none", "responseShape": "{ status: \\"success\\", data: [...] }" }
  ],
  "issuesFixed": ["short description of each thing you fixed"],
  "reply": "one short sentence, folded into the user-facing summary of this turn"
}

- Only include a file in "files" if you actually changed it from what you were given — most turns should only need to change server.js, sometimes nothing at all if everything already lines up.
- "apiContract" is the FINAL, authoritative list of every endpoint the app actually implements and uses, after your fixes.
- "issuesFixed" can be an empty array if nothing needed fixing — don't invent problems.`;
}

async function callNemotronConnect(refinedPrompt, uiFiles, backendFiles, apiKey) {
  const userMessage = `Original request for this turn: ${refinedPrompt}\n\nACTUAL UI FILES:\n\n${serializeFiles(
    toContextFiles(uiFiles)
  )}\n\n---\n\nACTUAL BACKEND FILES:\n\n${serializeFiles(toContextFiles(backendFiles))}`;

  const text = await callNemotron(buildNemotronConnectSystemInstruction(), userMessage, apiKey, { maxTokens: 8192 });
  const parsed = extractJsonObject(text);
  return {
    files: assertFileShape(Array.isArray(parsed.files) ? parsed.files : [], "Nemotron connect response"),
    apiContract: Array.isArray(parsed.apiContract) ? parsed.apiContract : [],
    issuesFixed: Array.isArray(parsed.issuesFixed) ? parsed.issuesFixed : [],
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
  };
}

// A minimal static-file server. Used only when NVIDIA_API_KEY isn't
// configured at all, so Nemotron can't run — last-resort fallback so a
// brand-new project still boots to something.
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
  const existingUIFiles = existingFiles.filter((f) => !isBackendPath(f.path));
  const existingBackendFiles = existingFiles.filter((f) => isBackendPath(f.path));

  try {
    // Phase 0 — refine the raw instruction into a full spec.
    const { refinedPrompt, featureList: refinedFeatureList } = await refinePrompt(prompt, existingFiles, geminiKey);

    let finalFiles = [];
    let finalReply = "";
    let finalFeatureList = refinedFeatureList;
    let finalApiContract = [];
    let model = "gemini";
    let geminiWasInvolved = false;

    if (!isEdit) {
      // ── NEW PROJECT: Gemini (UI) and Nemotron (backend) build in parallel ──
      geminiWasInvolved = true;

      if (!nvidiaKey) {
        const uiResult = await callGeminiForUI(refinedPrompt, refinedFeatureList, [], false, geminiKey);
        finalFiles = mergeFiles(uiResult.files, fallbackServerFiles());
        finalReply = uiResult.reply;
        finalFeatureList = uiResult.featureList.length ? uiResult.featureList : refinedFeatureList;
        finalApiContract = uiResult.apiContract;
        model = "gemini+fallback (NVIDIA_API_KEY not set)";
      } else {
        const [uiResult, backendDraft] = await Promise.all([
          callGeminiForUI(refinedPrompt, refinedFeatureList, [], false, geminiKey),
          callNemotronBackendDraft(refinedPrompt, refinedFeatureList, nvidiaKey),
        ]);

        try {
          const connectResult = await callNemotronConnect(refinedPrompt, uiResult.files, backendDraft, nvidiaKey);
          finalFiles = mergeFiles(uiResult.files, backendDraft, connectResult.files);
          finalReply = connectResult.reply || uiResult.reply;
          finalApiContract = connectResult.apiContract.length ? connectResult.apiContract : uiResult.apiContract;
          model = "gemini+nemotron (connected & debugged)";
        } catch (err) {
          // Integration pass failed — still ship the two independent
          // builds rather than losing the whole turn.
          const message = err instanceof Error ? err.message : String(err);
          finalFiles = mergeFiles(uiResult.files, backendDraft);
          finalReply = uiResult.reply + ` (Integration/debug pass failed: ${message} — shipped unreconciled.)`;
          finalApiContract = uiResult.apiContract;
          model = "gemini+nemotron (unreconciled — integration failed)";
        }
        finalFeatureList = uiResult.featureList.length ? uiResult.featureList : refinedFeatureList;
      }
    } else {
      // ── EDIT: Nemotron orchestrates; pulls in Gemini only for real UI work ──
      if (!nvidiaKey) {
        // No orchestrator available — fall back to direct Gemini edit.
        const uiResult = await callGeminiForUI(refinedPrompt, refinedFeatureList, existingUIFiles, true, geminiKey);
        finalFiles = uiResult.files;
        finalReply = uiResult.reply + (uiResult.files.length ? " (NVIDIA_API_KEY not set — backend/debug pass skipped.)" : "");
        finalFeatureList = uiResult.featureList.length ? uiResult.featureList : refinedFeatureList;
        finalApiContract = uiResult.apiContract;
        model = "gemini-only (NVIDIA_API_KEY not set)";
      } else {
        const orchestration = await callNemotronEditOrchestrator(refinedPrompt, existingFiles, nvidiaKey);

        if (!orchestration.needsGeminiUI) {
          // Nemotron handled everything itself — no separate connect pass,
          // its own prompt already requires it to debug as it goes.
          finalFiles = orchestration.files;
          finalReply = orchestration.reply;
          model = orchestration.files.length ? "nemotron (self-contained edit)" : "nemotron (no code change)";
        } else {
          geminiWasInvolved = true;
          const uiResult = await callGeminiForUI(
            orchestration.uiInstruction || refinedPrompt,
            refinedFeatureList,
            existingUIFiles,
            true,
            geminiKey
          );

          const currentUIFiles = mergeFiles(toGenerated(existingUIFiles), uiResult.files);
          const currentBackendFiles = mergeFiles(toGenerated(existingBackendFiles), orchestration.files);

          try {
            const connectResult = await callNemotronConnect(refinedPrompt, currentUIFiles, currentBackendFiles, nvidiaKey);
            finalFiles = mergeFiles(uiResult.files, orchestration.files, connectResult.files);
            finalReply = connectResult.reply || uiResult.reply || orchestration.reply;
            finalApiContract = connectResult.apiContract.length ? connectResult.apiContract : uiResult.apiContract;
            model = "gemini+nemotron (connected & debugged)";
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            finalFiles = mergeFiles(uiResult.files, orchestration.files);
            finalReply = (uiResult.reply || orchestration.reply) + ` (Integration/debug pass failed: ${message} — shipped unreconciled.)`;
            finalApiContract = uiResult.apiContract;
            model = "gemini+nemotron (unreconciled — integration failed)";
          }
        }
      }
    }

    const backendChangeNeeded = finalFiles.some((f) => isBackendPath(f.filePath));

    res.setHeader("X-Zephyr-Model", model);
    res.status(200).json({
      files: finalFiles,
      reply: (finalReply && finalReply.trim()) || "Done.",
      featureList: finalFeatureList,
      apiContract: finalApiContract,
      backendChangeNeeded,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

// {path, contents}[] -> {filePath, fullContent}[]
function toGenerated(contextFiles) {
  return (contextFiles || []).map((f) => ({ filePath: f.path, fullContent: f.contents }));
}
