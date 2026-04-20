// All requests go through Vite's /api proxy → http://localhost:8000
// This avoids cross-origin issues when running behind the Replit proxy.
const BASE = "/api";

export interface ApiUser {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export interface ApiProject {
  id: number;
  title: string;
  owner_id: number;
  created_at: string;
}

export interface ApiManuscript {
  id: number;
  content: string;
  project_id: number;
  created_at: string;
}

export interface ApiDataset {
  id: number;
  name: string;
  description: string | null;
  file_name: string | null;
  file_size: string | null;
  project_id: number;
  created_at: string;
}

export interface ApiExperiment {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  attachments: string | null;
  project_id: number;
  created_at: string;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${BASE}${path}`;

  console.log(`[API] ${options.method ?? "GET"} ${url}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  console.log(`[API] ${options.method ?? "GET"} ${url} → ${res.status}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    console.error(`[API] Error response:`, err);
    throw new Error(err.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  signup: (body: { email: string; password: string; role?: string }) => {
    console.log("[API] signup →", body.email, "role:", body.role ?? "owner");
    return request<ApiUser>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ role: "owner", ...body }),
    });
  },

  login: (body: { email: string; password: string }) => {
    console.log("[API] login →", body.email);
    return request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getMe: () => request<ApiUser>("/users/me"),

  // ── Projects ─────────────────────────────────────────────────────────────────
  getProjects: () => request<ApiProject[]>("/projects"),

  createProject: (title: string) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify({ title }) }),

  // ── Manuscript ───────────────────────────────────────────────────────────────
  getManuscript: (projectId: number) =>
    request<ApiManuscript | null>(`/projects/${projectId}/manuscript`),

  saveManuscript: (projectId: number, content: string) =>
    request<ApiManuscript>(`/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // ── Datasets ─────────────────────────────────────────────────────────────────
  getDatasets: (projectId: number) =>
    request<ApiDataset[]>(`/projects/${projectId}/datasets`),

  createDataset: (
    projectId: number,
    body: { name: string; description?: string; file_name?: string; file_size?: string }
  ) =>
    request<ApiDataset>(`/projects/${projectId}/datasets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteDataset: (projectId: number, datasetId: number) =>
    request<void>(`/projects/${projectId}/datasets/${datasetId}`, { method: "DELETE" }),

  // ── Experiments ──────────────────────────────────────────────────────────────
  getExperiments: (projectId: number) =>
    request<ApiExperiment[]>(`/projects/${projectId}/experiments`),

  createExperiment: (
    projectId: number,
    body: { name: string; description?: string; notes?: string; attachments?: string }
  ) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
