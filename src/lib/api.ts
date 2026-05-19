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

export interface ApiInvite {
  id: number;
  email: string;
  role: string;
  project_id: number;
  invited_by: number;
  status: string;
  created_at: string;
  email_warning?: string | null;
}

export interface ApiInvitePreview {
  invite_id: number;
  email: string;
  role: string;
  status: string;
  project_title: string;
  inviter_email: string;
  created_at: string;
}

export interface ApiInviteAcceptResponse {
  message: string;
  project_id: number;
  project_title: string;
  role: string;
  collaborator_id: number;
}

export interface ApiCollaborator {
  id: number;
  project_id: number;
  invite_id: number;
  email: string;
  role: string;
  user_id: number | null;
  joined_at: string;
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

  getProject: (id: number) => request<ApiProject>(`/projects/${id}`),

  createProject: (title: string) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify({ title }) }),

  updateProject: (id: number, body: { title?: string }) =>
    request<ApiProject>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: number) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),

  // ── Manuscript ───────────────────────────────────────────────────────────────
  getManuscript: (projectId: number) =>
    request<ApiManuscript | null>(`/projects/${projectId}/manuscript`),

  saveManuscript: (projectId: number, content: string) =>
    request<ApiManuscript>(`/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  updateManuscript: (projectId: number, content: string) =>
    request<ApiManuscript>(`/projects/${projectId}/manuscript`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),

  deleteManuscript: (projectId: number) =>
    request<void>(`/projects/${projectId}/manuscript`, { method: "DELETE" }),

  // ── Datasets ─────────────────────────────────────────────────────────────────
  getDatasets: (projectId: number) =>
    request<ApiDataset[]>(`/projects/${projectId}/datasets`),

  getDataset: (projectId: number, datasetId: number) =>
    request<ApiDataset>(`/projects/${projectId}/datasets/${datasetId}`),

  createDataset: (
    projectId: number,
    body: { name: string; description?: string; file_name?: string; file_size?: string }
  ) =>
    request<ApiDataset>(`/projects/${projectId}/datasets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDataset: (
    projectId: number,
    datasetId: number,
    body: { name?: string; description?: string; file_name?: string; file_size?: string }
  ) =>
    request<ApiDataset>(`/projects/${projectId}/datasets/${datasetId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteDataset: (projectId: number, datasetId: number) =>
    request<void>(`/projects/${projectId}/datasets/${datasetId}`, { method: "DELETE" }),

  // ── Experiments ──────────────────────────────────────────────────────────────
  getExperiments: (projectId: number) =>
    request<ApiExperiment[]>(`/projects/${projectId}/experiments`),

  getExperiment: (projectId: number, experimentId: number) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`),

  createExperiment: (
    projectId: number,
    body: { name: string; description?: string; notes?: string; attachments?: string }
  ) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateExperiment: (
    projectId: number,
    experimentId: number,
    body: { name?: string; description?: string; notes?: string; attachments?: string }
  ) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteExperiment: (projectId: number, experimentId: number) =>
    request<void>(`/projects/${projectId}/experiments/${experimentId}`, { method: "DELETE" }),

  // ── Invites ───────────────────────────────────────────────────────────────────
  sendInvite: (body: { email: string; project_id: number; role: string }) =>
    request<ApiInvite>("/invite", { method: "POST", body: JSON.stringify(body) }),

  getInvites: () => request<ApiInvite[]>("/invite"),

  previewInvite: (token: string) =>
    request<ApiInvitePreview>(`/invite/preview/${token}`),

  acceptInvite: (token: string) =>
    request<ApiInviteAcceptResponse>(`/invite/accept/${token}`, { method: "POST" }),

  getCollaborators: (projectId: number) =>
    request<ApiCollaborator[]>(`/projects/${projectId}/collaborators`),
};
