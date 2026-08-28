export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

const STORAGE_KEY = "zephyr_recent_projects";

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveProject(name: string): Project {
  const projects = loadProjects();
  const newProject: Project = {
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    createdAt: Date.now(),
  };

  const updated = [newProject, ...projects.filter((p) => p.name !== name.trim())].slice(0, 20);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to persist project in local storage", err);
  }
  return newProject;
}

export function deleteProject(id: string): void {
  const projects = loadProjects();
  const updated = projects.filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to remove project from local storage", err);
  }
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 45) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
