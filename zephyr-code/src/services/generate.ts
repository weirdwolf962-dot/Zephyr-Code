export interface GeneratedFile {
  filePath: string;
  fullContent: string;
}

export interface ApiContractEntry {
  method: string;
  path: string;
  description: string;
  requestShape?: string;
  responseShape: string;
}

export interface ExistingFile {
  path: string;
  contents: string;
}

export interface GenerateResult {
  files: GeneratedFile[];
  // A short, conversational message describing what changed this turn —
  // or, when no files changed at all, the direct answer to whatever the
  // person asked (a question, deployment advice, etc).
  reply: string;
  featureList: string[];
  apiContract: ApiContractEntry[];
  backendChangeNeeded: boolean;
}

export async function generateProject(prompt: string, existingFiles?: ExistingFile[]): Promise<GenerateResult> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, existingFiles }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Generation failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (!Array.isArray(data.files)) {
    throw new Error("Malformed response from /api/generate — expected a 'files' array.");
  }

  return {
    files: data.files,
    reply: typeof data.reply === "string" ? data.reply : "",
    featureList: Array.isArray(data.featureList) ? data.featureList : [],
    apiContract: Array.isArray(data.apiContract) ? data.apiContract : [],
    backendChangeNeeded: Boolean(data.backendChangeNeeded),
  };
}
