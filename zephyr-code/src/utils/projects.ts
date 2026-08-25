export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

const STORAGE_KEY = "zephyr-code:projects";

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProject(name: string): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.length > 60 ? name.slice(0, 60) + "…" : name,
    createdAt: Date.now(),
  };
  const projects = [project, ...loadProjects()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  return project;
}

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
