const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("hangar.token") : null;
}
export function setToken(t: string) {
  localStorage.setItem("hangar.token", t);
}
export function clearToken() {
  localStorage.removeItem("hangar.token");
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || r.statusText);
  return data as T;
}

export interface Project {
  id: string;
  name: string;
  sandbox_id: string | null;
  updated_at?: string;
}
export interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

export const api = {
  signup: (email: string, password: string) =>
    req<AuthResult>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => req<{ user: { id: string; email: string } }>("/api/auth/me"),
  listProjects: () => req<{ projects: Project[] }>("/api/projects"),
  createProject: (name: string) =>
    req<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => req<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
};
