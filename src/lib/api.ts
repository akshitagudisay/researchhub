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
  updated_at?: string | null;
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
  invite_id: number | null;
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

export interface ApiAccessRequest {
  id: number;
  project_id: number;
  requester_id: number;
  requested_role: string;
  status: string;
  created_at: string;
}

export interface ApiCitation {
  id: number;
  project_id: number;
  doi?: string | null;
  title: string;
  authors: string[];
  journal?: string | null;
  year?: number | null;
  citation_type: string;
  formatted_apa?: string | null;
  formatted_ieee?: string | null;
  created_at: string;
}

export interface ApiContribution {
  id: number;
  user_id: number;
  project_id: number;
  action_type: string;
  contribution_score: number;
  metadata?: string | null;
  timestamp: string;
}

export interface ApiContributionSummary {
  contributors: {
    user_id: number;
    email: string;
    total_score: number;
    percentage: number;
    actions: Record<string, number>;
  }[];
  total_score: number;
  recent_activity: {
    action_type: string;
    label: string;
    email: string;
    score: number;
    timestamp: string;
  }[];
  action_scores: Record<string, number>;
}

export interface ApiSuggestion {
  keywords: string[];
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi: string;
  formatted_apa: string;
  formatted_ieee: string;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  signup: (body: { email: string; password: string; role?: string }) =>
    request<ApiUser>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ role: "owner", ...body }),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => request<ApiUser>("/users/me"),

  // ── Projects ─────────────────────────────────────────────────────────────────
  getProjects: () => request<ApiProject[]>("/projects"),
  getProject: (id: number) => request<ApiProject>(`/projects/${id}`),
  createProject: (title: string) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify({ title }) }),
  updateProject: (id: number, body: { title?: string }) =>
    request<ApiProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: number) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  getMyRole: (projectId: number) =>
    request<{ role: string }>(`/projects/${projectId}/my-role`),

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
  createDataset: (projectId: number, body: { name: string; description?: string; file_name?: string; file_size?: string }) =>
    request<ApiDataset>(`/projects/${projectId}/datasets`, { method: "POST", body: JSON.stringify(body) }),
  updateDataset: (projectId: number, datasetId: number, body: { name?: string; description?: string; file_name?: string; file_size?: string }) =>
    request<ApiDataset>(`/projects/${projectId}/datasets/${datasetId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDataset: (projectId: number, datasetId: number) =>
    request<void>(`/projects/${projectId}/datasets/${datasetId}`, { method: "DELETE" }),

  // ── Experiments ──────────────────────────────────────────────────────────────
  getExperiments: (projectId: number) =>
    request<ApiExperiment[]>(`/projects/${projectId}/experiments`),
  getExperiment: (projectId: number, experimentId: number) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`),
  createExperiment: (projectId: number, body: { name: string; description?: string; notes?: string; attachments?: string }) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments`, { method: "POST", body: JSON.stringify(body) }),
  updateExperiment: (projectId: number, experimentId: number, body: { name?: string; description?: string; notes?: string; attachments?: string }) =>
    request<ApiExperiment>(`/projects/${projectId}/experiments/${experimentId}`, { method: "PATCH", body: JSON.stringify(body) }),
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

  // ── Collaborators ─────────────────────────────────────────────────────────────
  getCollaborators: (projectId: number) =>
    request<ApiCollaborator[]>(`/projects/${projectId}/collaborators`),
  updateCollaboratorRole: (projectId: number, userId: number, role: string) =>
    request<ApiCollaborator>(`/projects/${projectId}/collaborators/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeCollaborator: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/collaborators/${userId}`, { method: "DELETE" }),

  // ── Access Requests ───────────────────────────────────────────────────────────
  requestRole: (projectId: number, requestedRole: string) =>
    request<ApiAccessRequest>(`/projects/${projectId}/request-role`, {
      method: "POST",
      body: JSON.stringify({ requested_role: requestedRole }),
    }),
  getAccessRequests: (projectId: number) =>
    request<ApiAccessRequest[]>(`/projects/${projectId}/requests`),
  getMyAccessRequests: (projectId: number) =>
    request<ApiAccessRequest[]>(`/projects/${projectId}/my-requests`),
  reviewAccessRequest: (requestId: number, status: "approved" | "rejected") =>
    request<ApiAccessRequest>(`/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // ── Citations ─────────────────────────────────────────────────────────────────
  getCitations: (projectId: number) =>
    request<ApiCitation[]>(`/projects/${projectId}/citations`),
  addCitationByDoi: (projectId: number, doi: string) =>
    request<ApiCitation>(`/projects/${projectId}/citations/doi`, {
      method: "POST",
      body: JSON.stringify({ doi }),
    }),
  importBibtex: (projectId: number, bibtex: string) =>
    request<ApiCitation[]>(`/projects/${projectId}/citations/bibtex`, {
      method: "POST",
      body: JSON.stringify({ bibtex }),
    }),
  deleteCitation: (projectId: number, citationId: number) =>
    request<void>(`/projects/${projectId}/citations/${citationId}`, { method: "DELETE" }),
  getCitationSuggestions: (projectId: number) =>
    request<{ suggestions: ApiSuggestion[] }>(`/projects/${projectId}/citations/suggestions`),

  // ── Contributions ─────────────────────────────────────────────────────────────
  getContributions: (projectId: number) =>
    request<ApiContribution[]>(`/projects/${projectId}/contributions`),
  getContributionSummary: (projectId: number) =>
    request<ApiContributionSummary>(`/projects/${projectId}/contributions/summary`),
};
