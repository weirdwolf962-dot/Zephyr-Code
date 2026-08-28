// POST /api/generate
// Body: { prompt: string }
// Response: { files: [{ filePath, fullContent }, ...] }
//
// This is the ONE-model version of the relay: Gemini only, no routing yet
// (that's Step 7) and no elaborate tips/tricks system prompt yet (Step 8).
// Its only job right now is: take a plain-English request, come back with
// a small, complete, WebContainer-runnable project as strict JSON.

const GEMINI_MODEL = "gemini-3.7-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `You generate small web app projects that must run INSIDE a WebContainer (a real but constrained Node.js runtime in the browser). Follow these rules exactly:

1. Output a project with EXACTLY this shape:
   - package.json — "type": "module", and "scripts": { "dev": "node --watch server.js" }. NO dependencies — use only Node's built-in modules (node:http, node:fs, node:path). Do not use Express or any npm package: installs must stay fast and dependency-free.
   - server.js — a plain node:http server (no framework) that reads files from ./public and serves them. Must listen on: const port = process.env.PORT || 3111;
   - public/index.html — the app's markup.
   - public/style.css — the app's styling.
   - public/script.js — any client-side interactivity, loaded from index.html via a <script src="/script.js"> tag.

2. Build exactly what the user asks for in their request — a real, working, reasonably polished small app or page, not a placeholder.

3. Respond with ONLY a JSON array, no markdown fences, no prose, matching this shape:
[{ "filePath": "package.json", "fullContent": "..." }, { "filePath": "server.js", "fullContent": "..." }, { "filePath": "public/index.html", "fullContent": "..." }, { "filePath": "public/style.css", "fullContent": "..." }, { "filePath": "public/script.js", "fullContent": "..." }]

Every fullContent value must be the COMPLETE file, ready to run as-is.`;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      filePath: { type: "STRING" },
      fullContent: { type: "STRING" },
    },
    required: ["filePath", "fullContent"],
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not set on this deployment." });
    return;
  }

  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Request body must include a non-empty 'prompt' string." });
    return;
  }

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      res.status(502).json({ error: `Gemini API error (${geminiRes.status}): ${errBody.slice(0, 500)}` });
      return;
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: "Gemini returned no content.", raw: data });
      return;
    }

    let files;
    try {
      files = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Gemini's response wasn't valid JSON.", raw: text.slice(0, 1000) });
      return;
    }

    if (!Array.isArray(files) || files.some((f) => typeof f?.filePath !== "string" || typeof f?.fullContent !== "string")) {
      res.status(502).json({ error: "Gemini's JSON didn't match the expected {filePath, fullContent}[] shape." });
      return;
    }

    res.status(200).json({ files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
