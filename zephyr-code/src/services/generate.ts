export interface GeneratedFile {
  filePath: string;
  fullContent: string;
}

export async function generateProject(prompt: string): Promise<GeneratedFile[]> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Generation failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (!Array.isArray(data.files)) {
    throw new Error("Malformed response from /api/generate — expected a 'files' array.");
  }

  return data.files;
}